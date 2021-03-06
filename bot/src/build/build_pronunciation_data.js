const pronounceDb = require('./../common/pronunciation_db.js');
const pronunciationData = require('./../../resources/dictionaries/pronunciation.json');

const VERBOSE = true;

function log(str) {
  if (VERBOSE) {
    console.log(`-- ${str}`);
  }
}

async function build() {
  console.log('Building pronunciation data');

  log('Clearing prounciation DB');
  await pronounceDb.clearPronunciationInfo();
  log('Entering pronunciation info into DB');

  const searchTerms = Object.keys(pronunciationData);
  let promises = [];

  for (let i = 0; i < searchTerms.length; i += 1) {
    const searchTerm = searchTerms[i];
    const words = pronunciationData[searchTerm];

    promises.push(pronounceDb.addEntry(searchTerm, words));

    // To keep down memory usage
    if (promises.length >= 1000) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(promises);
      promises = [];
    }

    if (i % 10000 === 0) {
      log(`Search terms entered into DB: ${i}`);
    }
  }

  return Promise.all(promises);
}

if (require.main === module) {
  build().then(() => {
    console.log('done');
    process.exit(0);
  }).catch((err) => {
    console.warn(err);
    process.exit(1);
  });
}

module.exports = build;
