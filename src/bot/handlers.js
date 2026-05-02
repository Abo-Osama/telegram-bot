'use strict';

/**
 * bot/handlers.js
 * Contains all Telegram bot event handlers (GramJS version).
 */

const fs = require('fs-extra');
const path = require('path');
const { Api } = require('telegram');
const { Button } = require('telegram/tl/custom/button');
const { NewMessage } = require('telegram/events');
const { CallbackQuery } = require('telegram/events/CallbackQuery');
const config = require('../config');
const logger = require('../utils/logger');
const sessions = require('../state/sessions');
const fileUtils = require('../utils/fileUtils');
const { convertAudio } = require('../conversion/audioConverter');

// GramJS requires callback data as Buffer, not string
const cb = (str) => Buffer.from(str);

// ── Cover image mapping ──────────────────────────────────────────────────────
const coverImages = {
  'jmal':   { file: path.join(__dirname, '../ش_جمال.jpg'),          label: 'شــ. جمال عبدالرحمن' },
  'mohd':   { file: path.join(__dirname, '../ش_محمد.jpg'),          label: 'شــ. محمد يحيى' },
  'marwan': { file: path.join(__dirname, '../ش_مروان.jpeg'),        label: 'شــ. مروان مجدي' },
  'mihrab': { file: path.join(__dirname, '../تلاوات_المحراب.jpg'),  label: 'تلاوات المحراب' },
  'zad':    { file: path.join(__dirname, '../زاد_المسلم.jpg'),      label: 'زاد المسلم' },
};

const authorPresets = {
  'jmal':   'شــ. جمال عبدالرحمن',
  'mohd':   'شــ. محمد يحيى',
  'marwan': 'شــ. مروان مجدي',
};

module.exports = (client) => {
  /**
   * Helper to send messages safely with error handling
   */
  const safeSendMessage = async (chatId, options) => {
    try {
      return await client.sendMessage(chatId, options);
    } catch (err) {
      if (err.errorMessage === 'CHAT_ADMIN_REQUIRED') {
        logger.warn(`Cannot send message to chat ${chatId}: Bot lacks admin permissions`);
        return null;
      }
      if (err.errorMessage === 'CHAT_WRITE_FORBIDDEN') {
        logger.warn(`Cannot send message to chat ${chatId}: Writing is forbidden`);
        return null;
      }
      if (err.errorMessage === 'USER_IS_BLOCKED') {
        logger.warn(`Cannot send message to user ${chatId}: User blocked the bot`);
        return null;
      }
      throw err;
    }
  };

  /**
   * Helper to edit messages safely without crashing on MESSAGE_NOT_MODIFIED.
   */
  const safeEdit = async (chatId, messageId, text, buttons) => {
    try {
      await client.editMessage(chatId, {
        message: messageId,
        text: text,
        parseMode: 'markdown',
        buttons: buttons || undefined
      });
    } catch (err) {
      if (err.errorMessage !== 'MESSAGE_NOT_MODIFIED' && err.errorMessage !== 'MESSAGE_ID_INVALID') {
        logger.error(`Failed to edit message: ${err.message}`);
      }
    }
  };

  // ── /start Command ──────────────────────────────────────────────────────────
  client.addEventHandler(async (event) => {
    const message = event.message;
    const chatId = message.chatId;
    logger.info(`[START] Received /start from chatId=${chatId}`);
    const welcomeText = `👋 *أهلاً بك في بوت تحويل الوسائط!*\n\nسأقوم تلقائياً بتحويل أي ملف صوتي أو فيديو ترسله لي إلى صيغة *MP3*.\n\n_فقط أرسل لي ملفاً صوتياً، رسالة صوتية، أو فيديو للبدء._ (الحد الأقصى للحجم: ${config.maxFileSizeMB}ميجابايت)`;
    
    await safeSendMessage(chatId, { message: welcomeText, parseMode: 'markdown' });
  }, new NewMessage({ pattern: /^\/start$/ }));

  const processConversion = async (client, chatId, userId, session) => {
    const { inputFilePath, originalExt, targetFormat, fileName, messageId: replyToMessageId, authorName, coverFilePath, titleName } = session;
    
    const statusMsg = await safeSendMessage(chatId, {
      message: `⏳ *جاري المعالجة:* [${originalExt.toUpperCase()}]\n\n_يتم التحويل إلى ${targetFormat.toUpperCase()}..._`,
      parseMode: 'markdown',
      replyTo: replyToMessageId
    });
    
    if (!statusMsg) return;
    const messageId = statusMsg.id;
    let outputFilePath = null;

    try {
      outputFilePath = fileUtils.getTempFilePath(targetFormat);
      await convertAudio(inputFilePath, outputFilePath, targetFormat, coverFilePath, authorName, titleName);

      await safeSendMessage(chatId, {
        message: `📤 *جاري الرفع:* [${originalExt.toUpperCase()}]\n\n_يتم رفع ملف الـ ${targetFormat.toUpperCase()} الخاص بك..._`,
        parseMode: 'markdown'
      });

      const finalBaseName = titleName || path.parse(fileName).name;
      const convertedFileName = `${finalBaseName}.${targetFormat}`;
      
      const attributes = [
          new Api.DocumentAttributeAudio({ title: finalBaseName, performer: authorName || '' }),
          new Api.DocumentAttributeFilename({ fileName: convertedFileName })
      ];

      const sendOptions = {
        file: outputFilePath,
        caption: `✅ *${targetFormat.toUpperCase()}*`,
        parseMode: 'markdown',
        replyTo: replyToMessageId,
        workers: 16,
        attributes: attributes
      };

      if (coverFilePath) {
        sendOptions.thumb = coverFilePath;
      }

      try {
        await client.sendFile(chatId, sendOptions);
      } catch (err) {
        if (err.errorMessage === 'CHAT_ADMIN_REQUIRED') {
          logger.warn(`Cannot send file to chat ${chatId}: Bot lacks admin permissions`);
          await safeSendMessage(chatId, {
            message: `⚠️ *لا يمكن إرسال الملف:* البوت لا يملك صلاحيات المشرف في هذه الدردشة.\n\nيرجى إضافة البوت كمسؤول أو المحاولة في دردشة خاصة.`,
            parseMode: 'markdown'
          });
        } else {
          throw err;
        }
      }

    } catch (err) {
      logger.error(`Error processing request for user ${userId}: ${err.message}`);
      let errorMessage = `❌ *حدث خطأ أثناء عملية التحويل.*\n\n${err.message}`;
      await safeSendMessage(chatId, { message: errorMessage, parseMode: 'markdown' });
    } finally {
      await client.deleteMessages(chatId, [messageId], { revoke: true }).catch(()=>null);
      await fileUtils.cleanupFiles(inputFilePath, outputFilePath);
      // Clean up user-uploaded custom cover if present
      if (session.customCoverPath) {
        await fileUtils.cleanupFiles(session.customCoverPath).catch(()=>null);
      }
    }
  };

  // ── Callback Query Handler (inline button clicks) ──────────────────────────
  client.addEventHandler(async (event) => {
    const query = event.query;
    if (!query) return;

    const userId = query.userId ? query.userId.toString() : null;
    if (!userId || !sessions.has(userId)) {
      try { await event.answer({ text: 'انتهت الجلسة، أرسل ملفاً جديداً.' }); } catch(_) {}
      return;
    }

    const session = sessions.get(userId);
    const data = query.data ? query.data.toString('utf8') : '';
    const chatId = session.chatId;

    // ── Cover selection ─────────────────────────────────────────────────────
    if (data.startsWith('cover:')) {
      const coverKey = data.split(':')[1];

      // Handle custom image upload from device
      if (coverKey === 'custom') {
        session.step = 'WAITING_CUSTOM_COVER';
        sessions.set(userId, session);
        await safeEdit(chatId, query.msgId, '📁 *أرسل الصورة التي تريدها كغلاف:*', [
          [Button.inline('🔙 رجوع', cb('cover:back'))]
        ]);
        try { await event.answer({ text: 'أرسل الصورة من جهازك' }); } catch(_) {}
        return;
      }

      if (coverKey === 'back') {
        session.step = 'WAITING_COVER';
        sessions.set(userId, session);
        const coverButtons = [
          [Button.inline('شــ. جمال عبدالرحمن', cb('cover:jmal'))],
          [Button.inline('شــ. محمد يحيى', cb('cover:mohd'))],
          [Button.inline('شــ. مروان مجدي', cb('cover:marwan'))],
          [Button.inline('تلاوات المحراب', cb('cover:mihrab'))],
          [Button.inline('زاد المسلم', cb('cover:zad'))],
          [Button.inline('📁 رفع صورة من جهازك', cb('cover:custom'))],
        ];
        await safeEdit(chatId, query.msgId, '🖼 *اختر صورة الغلاف:*', coverButtons);
        try { await event.answer(); } catch(_) {}
        return;
      }

      const cover = coverImages[coverKey];
      if (!cover) return;

      session.coverFilePath = cover.file;
      session.step = 'WAITING_AUTHOR';
      sessions.set(userId, session);

      // Edit the cover message to show selection and author buttons
      const authorButtons = [
        [Button.inline('شــ. جمال عبدالرحمن', cb('author:jmal'))],
        [Button.inline('شــ. محمد يحيى', cb('author:mohd'))],
        [Button.inline('شــ. مروان مجدي', cb('author:marwan'))],
        [Button.inline('✏️ اكتب اسم تاني', cb('author:custom'))],
        [Button.inline('⏭ تخطي', cb('author:skip'))],
        [Button.inline('🔙 رجوع', cb('author:back'))],
      ];

      await safeEdit(chatId, query.msgId, `🖼 *تم اختيار الصورة:* ${cover.label}\n\n👤 *اختر اسم الشيخ:*`, authorButtons);

      try { await event.answer({ text: `تم اختيار ${cover.label}` }); } catch(_) {}
      return;
    }

    // ── Author selection ────────────────────────────────────────────────────
    if (data.startsWith('author:')) {
      const authorKey = data.split(':')[1];

      if (authorKey === 'back') {
        session.step = 'WAITING_COVER';
        sessions.set(userId, session);
        const coverButtons = [
          [Button.inline('شــ. جمال عبدالرحمن', cb('cover:jmal'))],
          [Button.inline('شــ. محمد يحيى', cb('cover:mohd'))],
          [Button.inline('شــ. مروان مجدي', cb('cover:marwan'))],
          [Button.inline('تلاوات المحراب', cb('cover:mihrab'))],
          [Button.inline('زاد المسلم', cb('cover:zad'))],
          [Button.inline('📁 رفع صورة من جهازك', cb('cover:custom'))],
        ];
        await safeEdit(chatId, query.msgId, '🖼 *اختر صورة الغلاف:*', coverButtons);
        try { await event.answer(); } catch(_) {}
        return;
      }

      if (authorKey === 'reselect') {
        session.step = 'WAITING_AUTHOR';
        sessions.set(userId, session);
        const authorButtons = [
          [Button.inline('شــ. جمال عبدالرحمن', cb('author:jmal'))],
          [Button.inline('شــ. محمد يحيى', cb('author:mohd'))],
          [Button.inline('شــ. مروان مجدي', cb('author:marwan'))],
          [Button.inline('✏️ اكتب اسم تاني', cb('author:custom'))],
          [Button.inline('⏭ تخطي', cb('author:skip'))],
          [Button.inline('🔙 رجوع', cb('author:back'))],
        ];
        await safeEdit(chatId, query.msgId, '👤 *اختر اسم الشيخ:*', authorButtons);
        try { await event.answer(); } catch(_) {}
        return;
      }

      if (authorKey === 'custom') {
        session.step = 'WAITING_AUTHOR_TEXT';
        sessions.set(userId, session);
        await safeEdit(chatId, query.msgId, '✏️ *اكتب اسم الشيخ:*', [
          [Button.inline('🔙 رجوع', cb('author:reselect'))]
        ]);
        try { await event.answer({ text: 'اكتب اسم الشيخ' }); } catch(_) {}
        return;
      }

      if (authorKey === 'skip') {
        session.authorName = null;
      } else if (authorPresets[authorKey]) {
        session.authorName = authorPresets[authorKey];
      } else {
        return;
      }

      session.step = 'WAITING_TITLE';
      sessions.set(userId, session);

      // Show title step
      const titleButtons = [
        [Button.inline('⏭ تخطي', cb('title:skip'))],
        [Button.inline('🔙 رجوع', cb('title:back'))],
      ];

      await safeEdit(chatId, query.msgId, `👤 *تم اختيار الشيخ:* ${session.authorName || 'تخطي'}\n\n📝 *أدخل العنوان (اختياري):*\n\nاكتب العنوان أو اضغط تخطي.`, titleButtons);

      try { await event.answer({ text: authorKey === 'skip' ? 'تم تخطي اسم الشيخ' : `تم اختيار ${session.authorName}` }); } catch(_) {}
      return;
    }

    // ── Title selection ────────────────────────────────────────────────────
    if (data.startsWith('title:')) {
      const titleKey = data.split(':')[1];

      if (titleKey === 'back') {
        session.step = 'WAITING_AUTHOR';
        sessions.set(userId, session);
        const authorButtons = [
          [Button.inline('شــ. جمال عبدالرحمن', cb('author:jmal'))],
          [Button.inline('شــ. محمد يحيى', cb('author:mohd'))],
          [Button.inline('شــ. مروان مجدي', cb('author:marwan'))],
          [Button.inline('✏️ اكتب اسم تاني', cb('author:custom'))],
          [Button.inline('⏭ تخطي', cb('author:skip'))],
          [Button.inline('🔙 رجوع', cb('author:back'))],
        ];
        await safeEdit(chatId, query.msgId, '👤 *اختر اسم الشيخ:*', authorButtons);
        try { await event.answer(); } catch(_) {}
        return;
      }

      if (titleKey === 'skip') {
        session.titleName = null;
      }

      // Proceed to conversion
      sessions.delete(userId);
      try { await event.answer({ text: 'جاري التحويل...' }); } catch(_) {}
      return processConversion(client, chatId, userId, session);
    }

  }, new CallbackQuery({}));

  // ── Message & File Upload Handler ───────────────────────────────────────────
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message) return;

    const chatId = message.chatId;
    const userId = message.senderId ? message.senderId.toString() : null;
    if (!userId) return;

    // Ignore messages sent by the bot itself
    if (message.out) return;

    if (message.message && message.message.match(/^\/start$/)) return; // Handled by /start

    logger.info(`[MSG] userId=${userId} hasMedia=${!!message.media} mediaClass=${message.media ? message.media.className : 'none'} text=${(message.message || '').slice(0, 50)}`);

    const text = message.message || '';
    
    // Check if user is in an active session
    if (sessions.has(userId)) {
      const session = sessions.get(userId);

      if (text.toLowerCase() === '/cancel') {
        sessions.delete(userId);
        if (session.inputFilePath) await fileUtils.cleanupFiles(session.inputFilePath);
        return safeSendMessage(chatId, { message: '🛑 *تم إلغاء العملية.*', parseMode: 'markdown' });
      }

      // User sent a custom cover image from their device
      if (session.step === 'WAITING_CUSTOM_COVER') {
        const img = message.media;
        if (!img || !(img instanceof Api.MessageMediaDocument || img instanceof Api.MessageMediaPhoto)) {
          return safeSendMessage(chatId, { message: '⚠️ *أرسل صورة فقط.*', parseMode: 'markdown' });
        }

        const customCoverPath = fileUtils.getTempFilePath('jpg');
        try {
          await client.downloadMedia(message.media, { outputFile: customCoverPath });
        } catch (e) {
          return safeSendMessage(chatId, { message: `❌ *فشل تحميل الصورة:* ${e.message}`, parseMode: 'markdown' });
        }

        session.coverFilePath = customCoverPath;
        session.customCoverPath = customCoverPath; // mark for cleanup
        session.step = 'WAITING_AUTHOR';
        sessions.set(userId, session);

        await safeSendMessage(chatId, { message: '✅ *تم استلام الصورة!*', parseMode: 'markdown' });

        const authorButtons = [
          [Button.inline('شــ. جمال عبدالرحمن', cb('author:jmal'))],
          [Button.inline('شــ. محمد يحيى', cb('author:mohd'))],
          [Button.inline('شــ. مروان مجدي', cb('author:marwan'))],
          [Button.inline('✏️ اكتب اسم تاني', cb('author:custom'))],
          [Button.inline('⏭ تخطي', cb('author:skip'))],
          [Button.inline('🔙 رجوع', cb('author:back'))],
        ];

        return safeSendMessage(chatId, {
          message: '👤 *اختر اسم الشيخ:*',
          parseMode: 'markdown',
          buttons: authorButtons
        });
      }

      // User is typing a custom author name
      if (session.step === 'WAITING_AUTHOR_TEXT') {
        if (text.length > 0) {
          session.authorName = text;
        } else {
          return safeSendMessage(chatId, { message: '⚠️ *إدخال غير صحيح.*\n\nيرجى إرسال اسم الشيخ.', parseMode: 'markdown' });
        }

        session.step = 'WAITING_TITLE';
        sessions.set(userId, session);

        const titleButtons = [
          [Button.inline('⏭ تخطي', cb('title:skip'))],
          [Button.inline('🔙 رجوع', cb('title:back'))],
        ];

        return safeSendMessage(chatId, {
          message: '📝 *أدخل العنوان (اختياري):*\n\nاكتب العنوان أو اضغط تخطي.',
          parseMode: 'markdown',
          buttons: titleButtons
        });
      }

      // User is typing a custom title
      if (session.step === 'WAITING_TITLE') {
        if (text.length > 0) {
          session.titleName = text.trim();
        } else {
          return safeSendMessage(chatId, { message: '⚠️ *إدخال غير صحيح.*\n\nيرجى إرسال العنوان، أو اضغط زر تخطي.', parseMode: 'markdown' });
        }

        // Proceed to conversion
        sessions.delete(userId);
        return processConversion(client, chatId, userId, session);
      }
    }

    // Normal processing if no session (check for media file)
    const media = message.media;
    if (!media) return;
    logger.info(`[MEDIA] className=${media.className} docExists=${!!(media.document)}`);
    if (!(media instanceof Api.MessageMediaDocument)) return;

    const document = media.document;

    // Reject non-audio documents except those with recognized extensions
    let fileName = 'audio_file';
    document.attributes.forEach(attr => {
        if (attr instanceof Api.DocumentAttributeFilename) {
            fileName = attr.fileName;
        }
    });

    const ext = fileUtils.getFileExtension(fileName);
    const isMedia = document.mimeType.startsWith('audio/') || document.mimeType.startsWith('video/') || config.supportedInputFormats.includes(ext);

    if (!isMedia) return;

    const fileSizeMB = (document.size || 0) / (1024 * 1024);
    if (fileSizeMB > config.maxFileSizeMB) {
      logger.warn(`User ${userId} sent a file that is too large: ${fileSizeMB.toFixed(1)}MB`);
      return safeSendMessage(chatId, { 
          message: `❌ *الملف كبير جداً!*\n\nحجم هذا الملف ${fileSizeMB.toFixed(1)}ميجابايت. الحد الأقصى هو *${config.maxFileSizeMB}ميجابايت*.\n\n_يرجى محاولة رفع ملف أصغر._`, 
          parseMode: 'markdown' 
      });
    }

    const originalExt = ext || 'unknown';
    const targetFormat = 'mp3'; // Currently fixed to MP3

    const statusMsg = await safeSendMessage(chatId, {
      message: `⏳ *جاري تحميل الملف:* [${originalExt.toUpperCase()}]\n\n_يرجى الانتظار..._`,
      parseMode: 'markdown',
      replyTo: message.id
    });
    
    if (!statusMsg) return;
    
    let inputFilePath = fileUtils.getTempFilePath(originalExt);
    
    try {
      await client.downloadMedia(message.media, {
          outputFile: inputFilePath,
          workers: 16
      });
      await client.deleteMessages(chatId, [statusMsg.id], { revoke: true }).catch(()=>null);

      // Show cover image selection buttons
      const coverButtons = [
        [Button.inline('شــ. جمال عبدالرحمن', cb('cover:jmal'))],
        [Button.inline('شــ. محمد يحيى', cb('cover:mohd'))],
        [Button.inline('شــ. مروان مجدي', cb('cover:marwan'))],
        [Button.inline('تلاوات المحراب', cb('cover:mihrab'))],
        [Button.inline('زاد المسلم', cb('cover:zad'))],
        [Button.inline('📁 رفع صورة من جهازك', cb('cover:custom'))],
      ];

      const coverMsg = await safeSendMessage(chatId, { 
        message: '🖼 *اختر صورة الغلاف:*',
        parseMode: 'markdown',
        buttons: coverButtons
      });

      // Start session
      sessions.set(userId, {
        step: 'WAITING_COVER',
        inputFilePath,
        originalExt,
        targetFormat,
        fileName,
        messageId: message.id,
        chatId,
        coverMsgId: coverMsg ? coverMsg.id : null,
        coverFilePath: null,
        authorName: null,
        titleName: null,
      });

    } catch (err) {
      logger.error(`Error downloading file for user ${userId}: ${err.message}`);
      await fileUtils.cleanupFiles(inputFilePath);
      await client.deleteMessages(chatId, [statusMsg.id], { revoke: true }).catch(()=>null);
      return safeSendMessage(chatId, { message: `❌ *حدث خطأ أثناء تحميل الملف.*\n\n${err.message}`, parseMode: 'markdown' });
    }

  }, new NewMessage({}));
};
