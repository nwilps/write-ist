//! The real dictionary, from the command line: words in on stdin, one per
//! line, the ones it does not know out on stdout. `scripts/spell-census.mjs`
//! uses it to put real numbers on a pass over a manuscript.
use std::io::{self, BufRead};

use write_ist_lib::spelling::{SpellEngine, SpellbookEngine, EN_US};

fn main() {
    let engine = SpellbookEngine::new(&EN_US, None).expect("the dictionary loads");
    let words: Vec<String> = io::stdin().lock().lines().map_while(Result::ok).collect();
    for word in engine.misspelled(&words) {
        println!("{word}");
    }
}
