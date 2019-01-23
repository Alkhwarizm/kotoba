const reload = require('require-reload');
const arrayOnDisk = require('disk-array');

const ExtendableTimeout = reload('./extendable_timeout.js');
const decksMetadata = reload('./../../../generated/quiz/decks.json');

const NON_EPHEMERAL_DECK_EXPIRATION_TIME = 60 * 60 * 1000; // 60 minutes
const EPHEMERAL_DECK_EXIRATION_TIME = 3 * 24 * 60 * 60 * 1000; // 3 days

const deckCache = {};
const timerForKey = {};

async function createDeckFromDiskMetadata(metadata) {
  const diskArray = await arrayOnDisk.load(metadata.cardDiskArrayPath, cache);
  const deck = { ...deckMetadata, cards: diskArray, isInternetDeck: false };

  return deck;
}

function cacheDeck(key, deck, expirationTimeMs) {
  if (deckCache[key]) {
    timerForKey.updateTimeout(expirationTimeMs);
  } else {
    deckCache[key] = deck;
    timerForKey[key] = ExtendableTimeout.createTimeout(() => {
      delete deckCache[key];
      delete timerForKey[key];
    }, expirationTimeMs);
  }
}

function getDiskDeckMetadata(deckNameOrKey) {
  const lowercaseNameOrKey = deckNameOrKey.toLowerCase();

  if (decksMetadata[lowercaseNameOrKey]) {
    return decksMetadata[lowercaseNameOrKey];
  }

  return Object.values(decksMetadata).find(metaData => metaData.uniqueId === lowercaseNameOrKey);
}

async function getInternetDeck(deckNameOrKey) {
  const lowercaseNameOrKey = deckNameOrKey.toLowerCase();


}

async function ensureCached(deckNameOrKey) {
  const lowercaseNameOrKey = deckNameOrKey.toLowerCase();

  // Check for the deck in the cache
  if (deckCache[lowercaseNameOrKey]) {
    return true;
  }

  // Check for the deck on disk
  const diskMetadata = getDiskDeckMetadata(lowercaseNameOrKey);
  if (diskMetadata) {
    const deck = await createDeckFromDiskMetadata(diskMetadata);
    cacheDeck(lowercaseNameOrKey, deck, NON_EPHEMERAL_DECK_EXPIRATION_TIME);
    cacheDeck(deck.uniqueId, deck, NON_EPHEMERAL_DECK_EXPIRATION_TIME);

    return true;
  }

  // Check for the deck on the internet
  const 

}
