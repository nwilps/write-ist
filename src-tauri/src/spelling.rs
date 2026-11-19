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
//!
//! A word can be taken out again, only by undoing the Add to Dictionary that
//! put it there. `spellbook` cannot forget a word, so the dictionary is built
//! again from the shipped one and the words that are left; the shipped
//! dictionary itself is never changed.

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
    /// Answers whether it was new to the writer's words.
    fn add_word(&self, word: &str) -> Result<bool, String>;
    /// Forget a word the writer added, between sessions too. Answers whether
    /// it was among the writer's words; a word that was not is left alone.
    fn remove_word(&self, word: &str) -> Result<bool, String>;
    /// The writer's own words, sorted, as the file holds them now: what
    /// Settings ▸ Dictionary lists. The shipped words are never listed.
    fn words(&self) -> Result<Vec<String>, String>;
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
    shipped: &'static Shipped,
    /// The dictionary and the writer's words, changed together.
    held: RwLock<Held>,
    custom: Custom,
}

struct Held {
    dictionary: Dictionary,
    /// The writer's words, as the file holds them.
    words: Vec<String>,
}

impl SpellbookEngine {
    /// Parse `shipped`, then add the words in `custom_file` (if any).
    pub fn new(shipped: &'static Shipped, custom_file: Option<PathBuf>) -> Result<Self, String> {
        let (custom, words) = Custom::open(custom_file)?;
        let dictionary = built(shipped, &words)?;
        Ok(SpellbookEngine { shipped, held: RwLock::new(Held { dictionary, words }), custom })
    }
}

/// The shipped dictionary with the writer's words added.
fn built(shipped: &Shipped, words: &[String]) -> Result<Dictionary, String> {
    let mut dictionary = Dictionary::new(shipped.aff, shipped.dic)
        .map_err(|error| format!("the {} dictionary could not be read: {error}", shipped.language))?;
    for word in words {
        // A line the dictionary cannot take is a line it skips; the file
        // is not the place to complain about it.
        let _ = dictionary.add(word);
    }
    Ok(dictionary)
}

/// The entry for `word`, or why it cannot be one.
fn checked_entry(word: &str) -> Result<String, String> {
    let entry = entry_for(word);
    if entry.is_empty() || entry.contains(char::is_whitespace) || entry.contains('/') {
        return Err(format!("{word:?} is not a word that can be added"));
    }
    Ok(entry)
}

impl SpellEngine for SpellbookEngine {
    fn misspelled(&self, words: &[String]) -> Vec<String> {
        let held = self.held.read().unwrap_or_else(|poisoned| poisoned.into_inner());
        words.iter().filter(|word| !held.dictionary.check(word)).cloned().collect()
    }

    fn suggest(&self, word: &str) -> Vec<String> {
        let held = self.held.read().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut found = Vec::new();
        held.dictionary.suggest(word, &mut found);
        found.truncate(MOST_SUGGESTIONS);
        found
    }

    fn add_word(&self, word: &str) -> Result<bool, String> {
        let entry = checked_entry(word)?;
        // Held across the write so two changes cannot lose each other.
        let mut held = self.held.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut words = self.custom.current(&held.words).map_err(|error| error.to_string())?;
        let added = !words.contains(&entry);
        if added {
            words.push(entry.clone());
            words.sort();
            self.custom.write(&words).map_err(|error| error.to_string())?;
        }
        held.words = words;
        held.dictionary.add(&entry).map_err(|error| error.to_string())?;
        Ok(added)
    }

    fn remove_word(&self, word: &str) -> Result<bool, String> {
        let entry = checked_entry(word)?;
        let mut held = self.held.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut words = self.custom.current(&held.words).map_err(|error| error.to_string())?;
        if !words.contains(&entry) {
            return Ok(false);
        }
        words.retain(|kept| kept != &entry);
        self.custom.write(&words).map_err(|error| error.to_string())?;
        held.dictionary = built(self.shipped, &words)?;
        held.words = words;
        Ok(true)
    }

    fn words(&self) -> Result<Vec<String>, String> {
        // Read only: the file is read back, never written, so a file that
        // could not be read is refused here as it is for a change.
        let held = self.held.read().unwrap_or_else(|poisoned| poisoned.into_inner());
        self.custom.current(&held.words).map_err(|error| error.to_string())
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
    /// The file was there and could not be read: never written over.
    unreadable: Option<String>,
}

impl Custom {
    /// The file, and the words it held.
    fn open(file: Option<PathBuf>) -> Result<(Self, Vec<String>), String> {
        let Some(path) = file else {
            return Ok((Custom { file: None, unreadable: None }, Vec::new()));
        };
        match fs::read_to_string(&path) {
            Ok(text) => Ok((Custom { file: Some(path), unreadable: None }, lines_of(&text))),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok((Custom { file: Some(path), unreadable: None }, Vec::new()))
            }
            // Spellcheck still works; changing a word is refused rather than
            // writing over a file that might hold hundreds.
            Err(error) => Ok((
                Custom { unreadable: Some(format!("{} could not be read: {error}", path.display())), file: Some(path) },
                Vec::new(),
            )),
        }
    }

    /// The words held, with any the file has gained since (it is read back,
    /// so it changes by one line whatever was written before). Refused for a
    /// file that could not be read.
    fn current(&self, held: &[String]) -> io::Result<Vec<String>> {
        if let Some(reason) = &self.unreadable {
            return Err(io::Error::other(format!("the custom dictionary is left alone: {reason}")));
        }
        let mut words = held.to_vec();
        if let Some(Ok(text)) = self.file.as_ref().map(fs::read_to_string) {
            for line in lines_of(&text) {
                if !words.contains(&line) {
                    words.push(line);
                }
            }
        }
        words.sort();
        Ok(words)
    }

    /// Write the file whole: temporary, flush, rename.
    fn write(&self, words: &[String]) -> io::Result<()> {
        let Some(path) = &self.file else { return Ok(()) };
        let text = words.iter().map(|word| format!("{word}\n")).collect::<String>();
        write_whole(path, &text)
    }
}

fn lines_of(text: &str) -> Vec<String> {
    text.lines().map(str::trim).filter(|line| !line.is_empty()).map(String::from).collect()
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

    #[test]
    fn adding_answers_whether_the_word_was_new() {
        let engine = engine();
        assert!(engine.add_word("Zorblax").unwrap());
        assert!(!engine.add_word("ZORBLAX").unwrap());
    }

    /// Undoing Add to Dictionary: the word is underlined again.
    #[test]
    fn a_removed_word_is_wrong_again() {
        let engine = engine();
        engine.add_word("QUIMBY").unwrap();
        assert!(engine.remove_word("QUIMBY").unwrap());
        assert_eq!(engine.misspelled(&words(&["QUIMBY", "Quimby"])), words(&["QUIMBY", "Quimby"]));
        // Ordinary words are still known after the dictionary is built again.
        assert!(engine.misspelled(&words(&["kitchen", "KITCHEN"])).is_empty());
    }

    /// Only the writer's words come out: a shipped word stays right.
    #[test]
    fn a_word_that_was_not_added_is_left_alone() {
        let folder = Folder::new("not-added");
        let file = folder.0.join("custom-words.txt");
        let engine = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        engine.add_word("Quimby").unwrap();
        assert!(!engine.remove_word("kitchen").unwrap());
        assert!(!engine.remove_word("Zorblax").unwrap());
        assert!(engine.misspelled(&words(&["kitchen", "Quimby"])).is_empty());
        assert_eq!(fs::read_to_string(&file).unwrap(), "Quimby\n");
    }

    #[test]
    fn a_removed_word_stays_removed_after_a_restart() {
        let folder = Folder::new("remove-restart");
        let file = folder.0.join("dictionary").join("custom-words.txt");

        let first = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        first.add_word("Zorblax").unwrap();
        first.add_word("Quimby").unwrap();
        assert!(first.remove_word("ZORBLAX").unwrap());
        assert_eq!(fs::read_to_string(&file).unwrap(), "Quimby\n");
        assert!(!folder.0.join("dictionary").join("custom-words.txt.writing").exists());

        let second = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert_eq!(second.misspelled(&words(&["Zorblax", "Quimby"])), words(&["Zorblax"]));
        // And put back (a redo), for good too.
        assert!(second.add_word("Zorblax").unwrap());
        let third = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert!(third.misspelled(&words(&["Zorblax", "Quimby"])).is_empty());
    }

    #[test]
    fn a_custom_dictionary_that_cannot_be_read_is_not_written_over_by_a_removal() {
        let folder = Folder::new("unreadable-remove");
        let file = folder.0.join("custom-words.txt");
        fs::create_dir_all(&file).unwrap();

        let engine = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert!(engine.remove_word("Zorblax").is_err());
        assert!(file.is_dir());
    }

    /// Settings ▸ Dictionary lists the writer's words, and only theirs.
    #[test]
    fn lists_the_writers_words_sorted_and_nothing_shipped() {
        let folder = Folder::new("list");
        let file = folder.0.join("dictionary").join("custom-words.txt");
        let engine = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert!(engine.words().unwrap().is_empty());
        engine.add_word("Zorblax").unwrap();
        engine.add_word("QUIMBY").unwrap();
        assert_eq!(engine.words().unwrap(), words(&["Quimby", "Zorblax"]));
        engine.remove_word("Zorblax").unwrap();
        assert_eq!(engine.words().unwrap(), words(&["Quimby"]));
        // Listing never writes.
        assert_eq!(fs::read_to_string(&file).unwrap(), "Quimby\n");
    }

    #[test]
    fn a_custom_dictionary_that_cannot_be_read_is_not_listed_as_empty() {
        let folder = Folder::new("unreadable-list");
        let file = folder.0.join("custom-words.txt");
        fs::create_dir_all(&file).unwrap();
        let engine = SpellbookEngine::new(&EN_US, Some(file.clone())).unwrap();
        assert!(engine.words().is_err());
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

        // Taking a word out builds the dictionary again: an undo waits this long.
        engine.add_word("Zorblax").unwrap();
        let started = Instant::now();
        engine.remove_word("Zorblax").unwrap();
        let removing = started.elapsed();
        eprintln!("load {loading:?}, 25,000 lookups {checking:?}, one suggestion {suggesting:?}, one removal {removing:?}");
        assert!(loading.as_secs() < 20 && checking.as_secs() < 20 && suggesting.as_secs() < 20 && removing.as_secs() < 20);
    }
}
