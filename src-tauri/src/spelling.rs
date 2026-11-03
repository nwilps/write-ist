//! Spellcheck's engine (slice 2, step 10; ADR-0032).
//!
//! **Ours, in Rust, offline.** The dictionaries are compiled into the
//! application (`dictionaries/`, each beside its licence notice) and nothing is
//! fetched, ever. The webview asks over IPC and never waits on a lookup on its
//! own thread: every command here is `async`, so Tauri runs it on its thread
//! pool, and the dictionary is read once, off the thread that draws the window.
//!
//! ## One small interface
//!
//! [`SpellEngine`] is the whole of what the application asks of a dictionary.
//! `spellbook` (MPL-2.0, Hunspell-compatible) implements it today; native
//! Hunspell can implement it later, and neither the dictionaries nor the
//! TypeScript side (`src/screenplay/spelling.ts`) will notice.
//!
//! ## The custom dictionary
//!
//! Words the writer adds are kept in one plain text file, one word per line,
//! in the application's own data folder — outside every bundle (ADR-0016: a
//! word list is not the writer's work, and losing it costs re-adding words).
//! It is written whole to a temporary file and renamed, and a file that exists
//! and cannot be read is never written over (ADR-0008 rule 3).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use spellbook::Dictionary;

/// What the application asks of a dictionary.
pub trait SpellEngine: Send + Sync {
    /// Those of `words` the dictionary does not know, in the order given.
    fn misspelled(&self, words: &[String]) -> Vec<String>;
    /// What `word` might have been, best first.
    fn suggest(&self, word: &str) -> Vec<String>;
    /// Make `word` right from now on, and remember it between sessions.
    fn add_word(&self, word: &str) -> Result<(), String>;
}

/// One dictionary that ships with the application.
pub struct Shipped {
    /// The language tag, as a data row: more languages are a file and a row.
    pub language: &'static str,
    pub aff: &'static str,
    pub dic: &'static str,
    /// The licence the dictionary requires to travel with it. Compiled in so a
    /// build without it fails; reproduced by the About screen when there is one.
    #[allow(dead_code)]
    pub notice: &'static str,
}

pub const EN_US: Shipped = Shipped {
    language: "en_US",
    aff: include_str!("../dictionaries/en_US/en_US.aff"),
    dic: include_str!("../dictionaries/en_US/en_US.dic"),
    notice: include_str!("../dictionaries/en_US/LICENSE"),
};

/// Every dictionary the application carries.
#[allow(dead_code)]
pub const SHIPPED: &[&Shipped] = &[&EN_US];

/// Most suggestions returned for one word.
const MOST_SUGGESTIONS: usize = 8;

/// `spellbook` behind [`SpellEngine`], with the writer's own words kept in a file.
pub struct SpellbookEngine {
    dictionary: RwLock<Dictionary>,
    custom: Custom,
}

impl SpellbookEngine {
    /// Parse `shipped`, then add the words in `custom_file` (if any).
    pub fn new(shipped: &Shipped, custom_file: Option<PathBuf>) -> Result<Self, String> {
        let mut dictionary = Dictionary::new(shipped.aff, shipped.dic)
            .map_err(|error| format!("the {} dictionary could not be read: {error}", shipped.language))?;
        let custom = Custom::open(custom_file)?;
        for word in &custom.words {
            // A line the dictionary cannot take is a line it skips; the file
            // is not the place to complain about it.
            let _ = dictionary.add(word);
        }
        Ok(SpellbookEngine { dictionary: RwLock::new(dictionary), custom })
    }
}

impl SpellEngine for SpellbookEngine {
    fn misspelled(&self, words: &[String]) -> Vec<String> {
        let dictionary = self.dictionary.read().unwrap_or_else(|poisoned| poisoned.into_inner());
        words.iter().filter(|word| !dictionary.check(word)).cloned().collect()
    }

    fn suggest(&self, word: &str) -> Vec<String> {
        let dictionary = self.dictionary.read().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut found = Vec::new();
        dictionary.suggest(word, &mut found);
        found.truncate(MOST_SUGGESTIONS);
        found
    }

    fn add_word(&self, word: &str) -> Result<(), String> {
        let entry = entry_for(word);
        if entry.is_empty() || entry.contains(char::is_whitespace) || entry.contains('/') {
            return Err(format!("{word:?} is not a word that can be added"));
        }
        // Held across the write so two additions cannot lose each other.
        let mut dictionary = self.dictionary.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        self.custom.add(&entry).map_err(|error| error.to_string())?;
        dictionary.add(&entry).map_err(|error| error.to_string())
    }
}

/// How a word is stored: as typed, except that CAPITALS are stored as a
/// capitalised word, which Hunspell accepts in both capitals and capitalised.
fn entry_for(word: &str) -> String {
    let word = word.trim().replace('\u{2019}', "'");
    let letters = word.chars().filter(|c| c.is_alphabetic()).count();
    if letters > 1 && word == word.to_uppercase() {
        let mut chars = word.chars();
        let first = chars.next().map(|c| c.to_uppercase().to_string()).unwrap_or_default();
        return first + &chars.as_str().to_lowercase();
    }
    word
}

/// The writer's words, as a file.
struct Custom {
    file: Option<PathBuf>,
    words: Vec<String>,
    /// The file was there and could not be read: never written over.
    unreadable: Option<String>,
}

impl Custom {
    fn open(file: Option<PathBuf>) -> Result<Self, String> {
        let Some(path) = file else {
            return Ok(Custom { file: None, words: Vec::new(), unreadable: None });
        };
        match fs::read_to_string(&path) {
            Ok(text) => {
                let words = text.lines().map(str::trim).filter(|line| !line.is_empty()).map(String::from).collect();
                Ok(Custom { file: Some(path), words, unreadable: None })
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok(Custom { file: Some(path), words: Vec::new(), unreadable: None })
            }
            // Spellcheck still works; adding a word is refused rather than
            // writing over a file that might hold hundreds.
            Err(error) => Ok(Custom {
                unreadable: Some(format!("{} could not be read: {error}", path.display())),
                file: Some(path),
                words: Vec::new(),
            }),
        }
    }

    /// Add one entry and write the file whole: temporary, flush, rename.
    fn add(&self, entry: &str) -> io::Result<()> {
        if let Some(reason) = &self.unreadable {
            return Err(io::Error::other(format!("the custom dictionary is left alone: {reason}")));
        }
        let Some(path) = &self.file else { return Ok(()) };
        let mut words = self.words.clone();
        // What an earlier call in this session wrote is read back, so the
        // file grows by one line however many words were added before.
        if let Ok(text) = fs::read_to_string(path) {
            for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
                if !words.iter().any(|word| word == line) {
                    words.push(line.to_string());
                }
            }
        }
        if !words.iter().any(|word| word == entry) {
            words.push(entry.to_string());
        }
        words.sort();
        write_whole(path, &(words.join("\n") + "\n"))
    }
}

fn write_whole(path: &Path, text: &str) -> io::Result<()> {
    use std::io::Write;
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder)?;
    }
    let temporary = path.with_extension("txt.writing");
    let mut file = fs::File::create(&temporary)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()?;
    fs::rename(&temporary, path)
}

/// The engine as the application holds it: built once, on first use or at
/// start-up, whichever comes first, and never on the thread that draws.
pub struct Engine {
    custom_file: Option<PathBuf>,
    built: OnceLock<Result<Box<dyn SpellEngine>, String>>,
}

impl Engine {
    pub fn new(custom_file: Option<PathBuf>) -> Self {
        Engine { custom_file, built: OnceLock::new() }
    }

    pub fn get(&self) -> Result<&dyn SpellEngine, String> {
        self.built
            .get_or_init(|| {
                SpellbookEngine::new(&EN_US, self.custom_file.clone())
                    .map(|engine| Box::new(engine) as Box<dyn SpellEngine>)
            })
            .as_ref()
            .map(|engine| engine.as_ref())
            .map_err(Clone::clone)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn engine() -> SpellbookEngine {
        SpellbookEngine::new(&EN_US, None).unwrap()
    }

    fn words(list: &[&str]) -> Vec<String> {
        list.iter().map(|word| word.to_string()).collect()
    }

    #[test]
    fn knows_ordinary_words_and_flags_misspellings() {
        let wrong = engine().misspelled(&words(&["kitchen", "kitchne", "hospital", "teh"]));
        assert_eq!(wrong, words(&["kitchne", "teh"]));
    }

    /// Q-U: cues and headings are all capitals, and a dictionary that treats
    /// capitals strictly would underline every heading in the script.
    #[test]
    fn capitals_are_checked_as_the_words_they_are() {
        let engine = engine();
        let right = words(&["KITCHEN", "HOSPITAL", "ROOM", "NIGHT", "DAY", "WALKS", "Kitchen", "I'M", "DON'T", "BENNETT'S"]);
        let wrong = engine.misspelled(&right);
        // Only a name that is not a word may be flagged here; no ordinary word.
        assert!(!wrong.iter().any(|word| word != "BENNETT'S"), "ordinary words flagged: {wrong:?}");
        assert_eq!(engine.misspelled(&words(&["KITCHNE", "HOSPITEL"])), words(&["KITCHNE", "HOSPITEL"]));
    }

    #[test]
    fn suggests_the_word_that_was_meant() {
        let engine = engine();
        assert!(engine.suggest("kitchne").contains(&"kitchen".to_string()));
        assert!(engine.suggest("KITCHNE").iter().any(|s| s.eq_ignore_ascii_case("kitchen")));
    }

    #[test]
    fn an_added_word_is_right_in_every_case_it_is_written_in() {
        let engine = engine();
        assert_eq!(engine.misspelled(&words(&["Zorblax"])), words(&["Zorblax"]));
        engine.add_word("Zorblax").unwrap();
        assert!(engine.misspelled(&words(&["Zorblax", "ZORBLAX"])).is_empty());

        // A word taken from a cue, in capitals, is right as a name in action too.
        engine.add_word("QUIMBY").unwrap();
        assert!(engine.misspelled(&words(&["QUIMBY", "Quimby"])).is_empty());
    }

    #[test]
    fn what_cannot_be_a_word_is_refused() {
        let engine = engine();
        assert!(engine.add_word("").is_err());
        assert!(engine.add_word("two words").is_err());
        assert!(engine.add_word("stem/ABC").is_err());
    }

    struct Folder(PathBuf);
    impl Folder {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!("write-ist-spell-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Folder(path)
        }
    }
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn the_custom_dictionary_survives_a_restart_as_a_plain_text_file() {
        let folder = Folder::new("restart");
        let file = folder.0.join("dictionary").join("custom-words.txt");

        let first = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        first.add_word("Zorblax").unwrap();
        first.add_word("Quimby").unwrap();
        first.add_word("Zorblax").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "Quimby\nZorblax\n");

        let second = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert!(second.misspelled(&words(&["Zorblax", "QUIMBY"])).is_empty());
        assert!(!folder.0.join("dictionary").join("custom-words.txt.writing").exists());
    }

    #[test]
    fn a_custom_dictionary_that_cannot_be_read_is_not_written_over() {
        let folder = Folder::new("unreadable");
        // A folder where the file should be: it exists, and it is not readable as text.
        let file = folder.0.join("custom-words.txt");
        fs::create_dir_all(&file).unwrap();

        let engine = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert!(engine.misspelled(&words(&["kitchen"])).is_empty());
        assert!(engine.add_word("Zorblax").is_err());
        assert!(file.is_dir());
    }

    /// ADR-0032: dictionaries ship "with their notices kept", and a shipped
    /// dictionary with none is a licence breach nobody would notice.
    #[test]
    fn every_dictionary_has_its_notice_beside_it() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("dictionaries");
        let mut folders = 0;
        for entry in fs::read_dir(&root).unwrap() {
            let folder = entry.unwrap().path();
            if !folder.is_dir() {
                continue;
            }
            folders += 1;
            let notice = folder.join("LICENSE");
            let text = fs::read_to_string(&notice)
                .unwrap_or_else(|_| panic!("{} ships without a LICENSE", folder.display()));
            assert!(text.contains("Copyright") || text.contains("copyright"), "{} has no copyright notice", notice.display());
        }
        assert_eq!(folders, SHIPPED.len(), "a dictionary folder is not in SHIPPED, or the reverse");
        for shipped in SHIPPED {
            assert!(!shipped.notice.trim().is_empty(), "{} has an empty notice", shipped.language);
        }
    }

    /// Reported in the pull request; a regression here is a slow first pass.
    #[test]
    fn timings_are_reasonable() {
        let started = Instant::now();
        let engine = engine();
        let loading = started.elapsed();

        let sample: Vec<String> = (0..25_000).map(|n| format!("word{}", "x".repeat(n % 7))).collect();
        let started = Instant::now();
        let _ = engine.misspelled(&sample);
        let checking = started.elapsed();

        let started = Instant::now();
        let _ = engine.suggest("kitchne");
        let suggesting = started.elapsed();
        eprintln!("load {loading:?}, 25,000 lookups {checking:?}, one suggestion {suggesting:?}");
        assert!(loading.as_secs() < 20 && checking.as_secs() < 20 && suggesting.as_secs() < 20);
    }
}
