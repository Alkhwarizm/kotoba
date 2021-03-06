const glob = require('glob');
const path = require('path');
const FontKit = require('fontkit');

let supportedCharactersForFont;

const SUPPORTED_CHARACTERS_MAP_DIR_PATH = path.join(__dirname, '..', '..', 'generated');
const SUPPORTED_CHARACTERS_MAP_PATH = path.join(SUPPORTED_CHARACTERS_MAP_DIR_PATH, 'supported_chars_for_font.json');
const RANDOM_FONT_SETTING = 'Random';

const fontMetaFilePaths = glob.sync(`${__dirname}/../../fonts/**/meta.json`);
const installedFonts = [];

fontMetaFilePaths.forEach((metaPath) => {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const meta = require(metaPath);
  const dir = path.dirname(metaPath);
  const fontFilePath = glob.sync(`${dir}/*.{otf,ttf,ttc}`)[0];
  installedFonts.push({
    filePath: fontFilePath,
    fontFamily: meta.fontFamily,
    order: meta.order,
    description: meta.description,
  });
});

try {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  supportedCharactersForFont = require(SUPPORTED_CHARACTERS_MAP_PATH);
} catch (err) {
  // Might not exist, might not be needed. If it's needed, will error.
}

function buildSupportedCharactersForFontMap() {
  const supportedCharactersForFontInner = {};
  installedFonts.forEach((fontInfo) => {
    const fontKitFont = FontKit.openSync(fontInfo.filePath);
    const fontKitFonts = fontKitFont.fonts || [fontKitFont];
    supportedCharactersForFontInner[fontInfo.fontFamily] = {};

    // font.characterSet contains code points that the font doesn't actually support.
    // Not 100% sure how fonts work in this respect, but this is the only reliable
    // way I could find to figure out which characters are actually supported.
    fontKitFonts.forEach((font) => {
      font.characterSet.forEach((char) => {
        const glyph = font.glyphForCodePoint(char);
        try {
          const fontSupportsCharacter = Number.isFinite(glyph.path.bbox.height);
          if (fontSupportsCharacter) {
            supportedCharactersForFontInner[fontInfo.fontFamily][String.fromCodePoint(char)] = true;
          }
        } catch (err) {
          // NOOP. Some of the properties on glyph are getters that error
          // if the glyph isn't supported. Catch those errors and skip the glyph.
        }
      });
    });
  });

  return supportedCharactersForFontInner;
}

installedFonts.sort((a, b) => a.order - b.order);

const allFonts = installedFonts.slice();
allFonts.push({
  fontFamily: RANDOM_FONT_SETTING,
  order: 1000,
  description: 'Cycle through fonts randomly',
});

function getRandomFont() {
  const randomIndex = Math.floor(Math.random() * installedFonts.length);
  return installedFonts[randomIndex].fontFamily;
}

function getFontFamilyForFontSetting(fontSetting) {
  if (fontSetting === RANDOM_FONT_SETTING) {
    return getRandomFont();
  }

  const fontInfo = installedFonts.find(info => info.fontFamily === fontSetting);
  if (!fontInfo) {
    return installedFonts[0].fontFamily;
  }

  return fontInfo.fontFamily;
}

function fontFamilySupportsCharacter(fontFamily, char) {
  if (!supportedCharactersForFont) {
    throw new Error('No supported character map found. Please run: npm run buildfontcharactermap');
  }
  return supportedCharactersForFont[fontFamily] && supportedCharactersForFont[fontFamily][char];
}

function fontFamilySupportsChars(fontFamily, chars) {
  return chars.every(c => fontFamilySupportsCharacter(fontFamily, c));
}

function coerceFontFamilyForString(fontFamily, str) {
  const chars = Array.from(str);
  if (fontFamilySupportsChars(fontFamily, chars)) {
    return fontFamily;
  }

  const supportedFontInfo = installedFonts.find(f => fontFamilySupportsChars(f.fontFamily, chars));
  if (supportedFontInfo) {
    return supportedFontInfo.fontFamily;
  }

  // I can't find a consistent way of figuring out which characters
  // are supported by each font. I think fontkit might have some bugs.
  // The hacks in buildSupportedCharactersForFontMap() work for most cases,
  // but they make us think BabelStone doesn't support Hentaigana, though it does.
  // Since BabelStone supports the most characters of any font, use it as the
  // fallback font if we have it.
  const babelStone = installedFonts.find(f => f.fontFamily === 'BabelStone Han');
  if (babelStone) {
    return babelStone.fontFamily;
  }

  return installedFonts[0].fontFamily;
}

module.exports = {
  installedFonts,
  allFonts,
  getFontFamilyForFontSetting,
  coerceFontFamilyForString,
  buildSupportedCharactersForFontMap,
  SUPPORTED_CHARACTERS_MAP_DIR_PATH,
  SUPPORTED_CHARACTERS_MAP_PATH,
};
