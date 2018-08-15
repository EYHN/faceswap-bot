const Telegraf = require('telegraf')
const session = require('telegraf/session')
const Telegram = require('telegraf/telegram')
const fetch = require('node-fetch');
const tmp = require('tmp-promise');
const fs = require('fs');
const spawn = require('cross-spawn');
const path = require('path');

const telegram = new Telegram(process.env.BOT_TOKEN)
const bot = new Telegraf(process.env.BOT_TOKEN)

async function downloadFileToTmp(fileID) {
  const path = (await telegram.getFile(fileID)).file_path;
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${path}`);
  const { path: tmppath, cleanup } = await tmp.file({ postfix: '.png' });
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(tmppath);
    res.body.pipe(dest);
    res.body.on('error', err => {
      reject(err);
    });
    dest.on('finish', () => {
      resolve();
    });
    dest.on('error', err => {
      reject(err);
    });
  });
  return { path: tmppath, cleanup }
}

const welcomeHTML = `<a href="https://telegra.ph/%E6%8D%A2%E8%84%B8Bot%E4%BD%BF%E7%94%A8%E6%95%99%E7%A8%8B-08-15">教程：</a>发送2张人脸的照片，换脸Bot 会将第一张图片中的人脸，换成第二张图片中的人脸。

⚠️换脸Bot使用 <a href="https://opensource.org/licenses/AGPL-3.0">AGPL-3.0</a> 发布，请发送 /about 了解详情
⚠️换脸Bot不适用于任何非法，不道德或可疑目的`;

const aboutMarkdown = `*关于此Bot*
此 Bot 基于 matthewearl 的代码添加了 telegram 的界面。

matthewearl/faceswap：https://github.com/matthewearl/faceswap
源代码：https://github.com/EYHN/faceswap-bot
licenses: [AGPL-3.0](https://opensource.org/licenses/AGPL-3.0)`

bot.use(session())
bot.start((ctx) => ctx.replyWithHTML(welcomeHTML))
bot.help((ctx) => ctx.replyWithMarkdown(welcomeMarkdown, {disable_web_page_preview: true}))
bot.command('about', (ctx) => ctx.replyWithMarkdown(aboutMarkdown))
bot.on('photo', async (ctx) => {
  if (typeof ctx.session.photos === 'undefined') {
    ctx.session.photos = [];
  }
  ctx.session.photos.push(ctx.message.photo[ctx.message.photo.length - 1].file_id);
  if (ctx.session.photos.length >= 2) {
    const photos = await Promise.all([
      downloadFileToTmp(ctx.session.photos.shift()),
      downloadFileToTmp(ctx.session.photos.shift())
    ]);
    const { path: tmppath, cleanup } = await tmp.file({ postfix: '.png' });
    try {
      await new Promise((resolve, reject) => {
        const python = spawn('python3', [path.join(__dirname, './faceswap/faceswap.py'), photos[0].path, photos[1].path, tmppath], { cwd: __dirname });
        python.on('close', (code) => {
          if (code !== 0) {
            reject('失败了');
          } else {
            resolve(ctx.replyWithPhoto({source: tmppath}));
          }
        });
        python.on('error', (err) => {
          reject('内部错误');
        });
      });
    } catch (error) {
      await ctx.reply(error);
    } finally {
      cleanup();
      photos[0].cleanup();
      photos[1].cleanup();
    }

  }
});

bot.command('cancel', (ctx) => {
  ctx.session.photos = [];
  ctx.reply('已取消');
});

bot.startPolling()

bot.catch((err) => {
  console.log('Ooops!', err)
})
