const assert = require('assert');
const { PublicError } = require('monochrome-bot');

// CONFIG START

const EMBED_COLOR = 2522111;
const INPUT_TIMEOUT_MS = 180000;
const ALIASES = ['settings', 'setting'];
const HELP_SHORT_DESCRIPTION = 'Configure my settings.';
const HELP_LONG_DESCRIPTION = 'Configure my settings. Server admins can configure my default settings on their server. Users can configure user settings.';

// CONFIG END

const CATEGORY_DESCRIPTION = 'The following subcategories and settings are available. Type the number of the one you want to see/change.';

const currentActiveKeys = {};

function keyForMessage(msg) {
  return `${msg.channel.id}_${msg.author.id}`;
}

function isCategory(settingsTreeNode) {
  return Array.isArray(settingsTreeNode) || settingsTreeNode.children;
}

function createFieldsForChildren(children) {
  const categories = [];
  const settings = [];

  children.forEach((child) => {
    if (isCategory(child)) {
      categories.push(child);
    } else {
      settings.push(child);
    }
  });

  let optionNumber = 0;

  const settingsString = settings.map((setting) => {
    optionNumber += 1;
    const adminOnlyString = !setting.userSetting ? ' (*server admin only*)' : '';
    return `${optionNumber}. ${setting.userFacingName}${adminOnlyString}`;
  }).join('\n');

  const categoriesString = categories.map((category) => {
    optionNumber += 1;
    return `${optionNumber}. ${category.userFacingName}`;
  }).join('\n');

  const fields = [];

  if (settingsString) {
    fields.push({ name: 'Settings', value: settingsString });
  }
  if (categoriesString) {
    fields.push({ name: 'Subcategories', value: categoriesString });
  }

  return fields;
}

function createPromptContentForRoot(children, iconUri) {
  return {
    embed: {
      title: 'Settings',
      description: CATEGORY_DESCRIPTION,
      fields: createFieldsForChildren(children),
      color: EMBED_COLOR,
      footer: {
        icon_url: iconUri,
        text: 'Say \'cancel\' to cancel.',
      },
    },
  };
}

function createPromptContentForCategory(category, iconUri) {
  return {
    embed: {
      title: `Settings (${category.userFacingName})`,
      description: CATEGORY_DESCRIPTION,
      fields: createFieldsForChildren(category.children),
      color: EMBED_COLOR,
      footer: {
        icon_url: iconUri,
        text: 'You can also say \'back\' or \'cancel\'.',
      },
    },
  };
}

async function createPromptContentForSetting(msg, settings, setting, iconUri) {
  return {
    embed: {
      title: `Settings (${setting.userFacingName})`,
      description: setting.description,
      color: EMBED_COLOR,
      fields: [
        {
          name: 'Allowed values',
          value: setting.allowedValuesDescription,
        },
        {
          name: 'Can be changed by',
          value: setting.userSetting ? 'Anyone' : 'Server admin',
        },
        {
          name: 'Current value',
          value: await settings.getUserFacingSettingValue(
            setting.uniqueId,
            msg.channel.guild ? msg.channel.guild.id : msg.channel.id,
            msg.channel.id,
            msg.author.id,
          ),
        },
      ],
      footer: {
        icon_url: iconUri,
        text: 'To change the value, type in the new value. Or say \'back\' or \'cancel\'.',
      },
    },
  };
}

function tryApplySetting() {
  return Promise.resolve(); // TODO
}

async function showSettingNode(monochrome, msg, node) {
  assert(!node.children, 'Expected node to be a leaf');
  const iconUri = monochrome.getSettingsIconUri();
  const promptContent = await createPromptContentForSetting(
    msg,
    monochrome.getSettings(),
    node,
    iconUri,
  );

  await msg.channel.createMessage(promptContent);
}

function childIndexFromString(str) {
  return parseInt(str, 10) - 1;
}

async function showCategoryNode(monochrome, msg, node) {
  const iconUri = monochrome.getSettingsIconUri();

  let { children } = node;
  let promptContent;
  if (children) {
    promptContent = createPromptContentForCategory(node, iconUri);
  } else {
    children = node;
    promptContent = createPromptContentForRoot(children, iconUri);
  }

  await msg.channel.createMessage(promptContent);

  const response = await monochrome.waitForMessage(INPUT_TIMEOUT_MS, (candidateMsg) => {
    const childIndex = childIndexFromString(candidateMsg.content);
    return candidateMsg.author.id === msg.author.id
      && candidateMsg.channel.id === msg.channel.id
      && (children[childIndex] || msg.content === 'cancel' || msg.content === 'back');
  });

  // TODO: Handle back and cancel.

  const childIndex = childIndexFromString(response.content);
  const childNode = children[childIndex];

  return showNode(monochrome, msg, childNode);
}

function showNode(monochrome, msg, node) {
  if (isCategory(node)) {
    return showCategoryNode(monochrome, msg, node);
  }

  return showSettingNode(monochrome, msg, node);
}

function execute(monochrome, msg, args) {
  let currentSubTree = monochrome.getSettings().getRawSettingsTree();
  const remainingArgs = args.slice();

  while (remainingArgs.length > 0) {
    let children;
    if (Array.isArray(currentSubTree)) {
      children = currentSubTree;
    } else {
      ({ children } = currentSubTree);
    }

    if (!children) {
      const newSettingValue = remainingArgs.join(' ');
      return tryApplySetting(monochrome, msg, currentSubTree, newSettingValue);
    }

    const childIndex = childIndexFromString(remainingArgs.shift());
    if (children[childIndex]) {
      currentSubTree = children[childIndex];
    } else {
      return showNode(monochrome, msg, currentSubTree);
    }
  }

  return showNode(monochrome, msg, currentSubTree);
}

module.exports = {
  commandAliases: ALIASES,
  uniqueId: 'settings',
  canBeChannelRestricted: false,
  shortDescription: HELP_SHORT_DESCRIPTION,
  longDescription: HELP_LONG_DESCRIPTION,
  async action(bot, msg, suffix, monochrome) {
    const key = keyForMessage(msg);
    if (currentActiveKeys[key]) {
      throw PublicError.createWithCustomPublicMessage('You already have a settings menu open. You can close it by saying **cancel**.', true, 'Menu already open');
    }

    currentActiveKeys[key] = true;
    const args = suffix.split(' ').map(s => s.trim()).filter(s => s);
    try {
      await execute(monochrome, msg, args);
      delete currentActiveKeys[key];
    } catch (err) {
      delete currentActiveKeys[key];
      if (err.message !== 'WAITER TIMEOUT') {
        throw err;
      }

      throw PublicError.createWithCustomPublicMessage('The settings menu has closed due to inactivity.', true, 'Closed due to inactivity');
    }
  },
};
