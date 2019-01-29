const assert = require('assert');
const { PublicError } = require('monochrome-bot');

// CONFIG START

const EMBED_COLOR = 2522111;
const INPUT_TIMEOUT_MS = 180000;
const ALIASES = ['settings', 'setting'];
const ALIASES_FOR_HELP = ['settings'];
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

async function createPromptContentForSetting(commanderMsg, settings, setting, iconUri) {
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
          name: 'Shortcut',
          value: `You can get back to this setting quickly by saying **${commanderMsg.prefix}${ALIASES[0]} ${setting.path.map(x => x + 1).join(' ')}**`,
        },
        {
          name: 'Current value',
          value: await settings.getUserFacingSettingValue(
            setting.uniqueId,
            commanderMsg.channel.guild ? commanderMsg.channel.guild.id : commanderMsg.channel.id,
            commanderMsg.channel.id,
            commanderMsg.author.id,
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

async function tryApplyUserSetting(monochrome, commanderMsg, settingNode, newSettingValue) {

}

async function tryApplyServerSetting(monochrome, commanderMsg, settingNode, newSettingValue) {

}

async function tryApplyChannelSetting(monochrome, commanderMsg, settingNode, newSettingValue, channels) {

}

async function tryApplySetting(monochrome, commanderMsg, settingNode, newSettingValue) {
  const userIsServerAdmin = monochrome.userIsServerAdmin(msg);
  const canSetChannel = userIsServerAdmin && settingNode.channelSetting;
  const canSetServer = userIsServerAdmin && settingNode.serverSetting;
  const canSetSelf = settingNode.userSetting;

  if (!canSetSelf && !canSetChannel && !canSetServer && !userIsServerAdmin) {
    return commanderMsg.channel.createMessage('Only a server admin can change that setting. The settings menu is now closed.');
  }

  if (canSetSelf && !canSetChannel && !canSetServer) {
    return tryApplyUserSetting;
  }

  if (canSetServer && !canSetChannel && !canSetSelf) {
    return tryApplyServerSetting;
  }

  while (true) {
    if (canSetServer && canSetChannel && canSetSelf) {
      await commanderMsg.channel.createMessage('Where should the new setting apply? You can say **me**, **this server**, **this channel**, or list channels, for example: **#bot #quiz1 #quiz2**. You can also say **back** or **cancel**.');
    } else if (canSetServer && canSetSelf) {
      await commanderMsg.channel.createMessage('Where should the new setting apply? You can say **me** or **this server**');
    } else if (canSetChannel && canSetServer) {
      await commanderMsg.channel.createMessage('Where should the new setting apply? You can say **this server**, **this channel**, or list channels, for example: **#bot #quiz1 #quiz2**. You can also say **back** or **cancel**.');
    } else if (canSetChannel && canSetSelf) {
      await commanderMsg.channel.createMessage('Where should the new setting apply? You can say **me**, **this channel**, or list channels, for example: **#bot #quiz1 #quiz2**. You can also say **back** or **cancel**.');
    } else if (canSetChannel) {
      await commanderMsg.channel.createMessage('Where should the new setting apply? You can say **this channel**, or list channels, for example: **#bot #quiz1 #quiz2**. You can also say **back** or **cancel**.');
    } else {
      assert.fail('Unexpected branch');
    }

    const response = await monochrome.waitForMessage(
      INPUT_TIMEOUT_MS,
      candidateMsg => msgContextMatches(commanderMsg, candidateMsg),
    ).content.toLowerCase();

    const handledCanceled = await tryHandleCancel(commanderMsg, response);
    if (handledCanceled) {
      return handledCanceled;
    }

    const handledBack = await tryHandleBack(monochrome, commanderMsg, response, node);
    if (handledBack) {
      return handledBack;
    }

    if (response === 'this server') {
      if (canSetServer) {
        return tryApplyServerSetting;
      }

      if (settingNode.serverSetting) {
        await msg.channel.createMessage('Only a server admin can set that setting server-wide, please try again.');
      } else {
        await msg.channel.createMessage('That setting cannot be set server-wide. Please try again.');
      }
    } else if (response === 'me') {
      if (canSetSelf) {
        return tryApplyUserSetting;
      }

      await msg.channel.createMessage('That setting cannot be set as a user setting. Please try again.');
    } else if (response === 'this channel') {
      if (canSetChannel) {
        return function() {
          return tryApplyChannelSetting(...arguments, [commanderMsg.channel.id]);
        };
      }

      if (settingNode.channelSetting) {
        await msg.channel.createMessage('Only a server admin can set that setting on a channel, please try again.');
      } else {
        await msg.channel.createMessage('That setting cannot be set on a channel. Please try again.');
      }
    } else {
      const channelIds = response.split(' ')
        .filter(s => s.trim())
        .map(s => s.replace(/<#(.*?)>/, (match, group1) => group1));
      
      const invalidChannelId = getInvalidChannelId(channelIds, commanderMsg);
      if (canSetChannel && invalidChannelId) {
        await msg.channel.createMessage(`I didn't find a channel called #<${invalidChannelId}>. Please try again.`);
      } else if (canSetChannel) {
        return tryApplyChannelSetting(...arguments, channelIds);
      } else if (settingNode.channelSetting) {
        await msg.channel.createMessage('Only a server admin can set that setting on a channel, please try again.');
      } else {
        await msg.channel.createMessage('That setting cannot be set on a channel. Please try again.');
      }
    }
  }
}

function tryHandleCancel(commanderMsg, responseContent) {
  if (responseContent.toLowerCase() === 'cancel') {
    return commanderMsg.channel.createMessage('The settings menu has been closed.');
  }

  return false;
}

function tryHandleBack(monochrome, commanderMsg, responseContent, node) {
  if (responseContent.toLowerCase() === 'back') {
    if (node.parent) {
      return showCategoryNode(monochrome, commanderMsg, node.parent);
    } else {
      return commanderMsg.channel.createMessage('The settings menu has been closed.');
    }
  }

  return false;
}

async function showSettingNode(monochrome, commanderMsg, node) {
  assert(!node.children, 'Expected node to be a leaf');
  const iconUri = monochrome.getSettingsIconUri();
  const promptContent = await createPromptContentForSetting(
    commanderMsg,
    monochrome.getSettings(),
    node,
    iconUri,
  );

  await commanderMsg.channel.createMessage(promptContent);

  while (true) {
    const response = await monochrome.waitForMessage(
      INPUT_TIMEOUT_MS,
      candidateMsg => msgContextMatches(commanderMsg, candidateMsg),
    );

    const handledCanceled = await tryHandleCancel(commanderMsg, response.content);
    if (handledCanceled) {
      return handledCanceled;
    }

    const handledBack = await tryHandleBack(monochrome, commanderMsg, response.content, node);
    if (handledBack) {
      return handledBack;
    }
  }
}

function childIndexFromString(str) {
  return parseInt(str, 10) - 1;
}

async function showCategoryNode(monochrome, commanderMsg, node) {
  const iconUri = monochrome.getSettingsIconUri();

  let { children } = node;
  let promptContent;
  if (children) {
    promptContent = createPromptContentForCategory(node, iconUri);
  } else {
    children = node;
    promptContent = createPromptContentForRoot(children, iconUri);
  }

  await commanderMsg.channel.createMessage(promptContent);

  const response = await monochrome.waitForMessage(INPUT_TIMEOUT_MS, (candidateMsg) => {
    const childIndex = childIndexFromString(candidateMsg.content);
    return msgContextMatches(candidateMsg, commanderMsg)
      && (children[childIndex]
        || candidateMsg.content === 'cancel'
        || candidateMsg.content === 'back');
  });

  const handledCanceled = await tryHandleCancel(commanderMsg, response.content);
  if (handledCanceled) {
    return handledCanceled;
  }

  const handledBack = await tryHandleBack(monochrome, commanderMsg, response.content, node);
  if (handledBack) {
    return handledBack;
  }

  const childIndex = childIndexFromString(response.content);
  const childNode = children[childIndex];

  return showNode(monochrome, commanderMsg, childNode);
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
  aliasesForHelp: ALIASES_FOR_HELP,
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
