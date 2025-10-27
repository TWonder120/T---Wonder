import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import Canvas from "canvas";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";
import {
  createAccount,
  getAccount,
  updateAvatar,
  updateUsername,
  updateHandle,
  hasAccount,
  checkUsernameChangeTime,
  checkHandleChangeTime,
} from "./dbAccountManager.js";
import { testConnection } from "./database.js";
import dotenv from "dotenv";

// تحميل متغيرات البيئة
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات البوت من متغيرات البيئة
const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  OWNER_GUILD_ID: process.env.OWNER_GUILD_ID,
  DEVELOPER_ID: process.env.DEVELOPER_ID
};

// التحقق من وجود جميع المتغيرات المطلوبة
const requiredVars = ['BOT_TOKEN', 'CLIENT_ID', 'OWNER_GUILD_ID', 'DEVELOPER_ID'];
const missingVars = requiredVars.filter(varName => !config[varName]);

if (missingVars.length > 0) {
  console.error('❌ متغيرات البيئة المفقودة:', missingVars.join(', '));
  console.error('📝 تأكد من إعداد ملف .env أو متغيرات البيئة في Render');
  process.exit(1);
}

// دالة للتحقق من صلاحيات المطور
function isDeveloper(userId) {
  return userId === config.OWNER_GUILD_ID || userId === config.DEVELOPER_ID;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// تحميل جميع أوامر السلاش من مجلد Commands
client.commands = new Collection();
const commandsArray = [];
const commandsPath = path.join(__dirname, "Commands");

// انتظار تحميل جميع الأوامر ثم تسجيلها
async function loadAndRegisterCommands() {
  try {
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const command = await import(
        pathToFileURL(path.join(commandsPath, file)).href
      );
      client.commands.set(command.default.data.name, command.default);
      commandsArray.push(command.default.data.toJSON());
    }

    // تسجيل الأوامر مع ديسكورد
    const rest = new REST({ version: "10" }).setToken(config.BOT_TOKEN);

    await rest.put(Routes.applicationCommands(config.CLIENT_ID), {
      body: commandsArray,
    });
  } catch (error) {
    console.error("خطأ في تحميل أو تسجيل الأوامر:", error);
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // اختبار الاتصال بقاعدة البيانات
  console.log("🔄 اختبار الاتصال بقاعدة البيانات...");
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.log("⚠️ تحذير: فشل الاتصال بقاعدة البيانات. تأكد من إعداد متغير DATABASE_URL");
    console.log("📝 يمكنك تشغيل: npm run setup-db لإعداد قاعدة البيانات");
  } else {
    console.log("✅ تم الاتصال بقاعدة البيانات بنجاح");
  }
  
  client.user.setActivity("Wonder Twitter Is Coming", {
    type: 1, // STREAMING
    url: "https://twitch.tv/random",
  });

  // حفظ أسماء جميع السيرفرات الموجودة
  client.guilds.cache.forEach((guild) => {
    saveGuildName(guild.id, guild.name);
  });

  // تحميل وتسجيل الأوامر عند تشغيل البوت
  await loadAndRegisterCommands();

  // دخول تلقائي للرومات الصوتية المحدةدة
  await joinConfiguredVoiceChannels();

  // بدء الفحص الدوري للاتصالات الصوتية
  startVoiceConnectionMonitor();

  // تطبيق الإعدادات الجديدة على جميع السيرفرات
  applyNewSettingsToAllServers();

  // تنظيف الروابط القديمة
  await cleanupOldAvatarUrls();
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, config);
    } catch (error) {
      console.error(`خطأ في تنفيذ الأمر ${interaction.commandName}:`, error);

      // التحقق من نوع الخطأ
      if (error.code === 10062) {
        console.log("التفاعل انتهت صلاحيته أو تم الرد عليه مسبقاً");
        return;
      }

      // محاولة الرد على الخطأ إذا كان التفاعل لا يزال صالحاً
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "حدث خطأ أثناء تنفيذ الأمر.",
            flags: [MessageFlags.Ephemeral],
          });
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: "حدث خطأ أثناء تنفيذ الأمر.",
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (replyError) {
        console.error("خطأ في الرد على الخطأ:", replyError);
      }
    }
  }
  if (interaction.isButton()) {
    if (interaction.customId === "tweet") {
      const modal = new ModalBuilder()
        .setCustomId("tweetModal")
        .setTitle("اكتب تغريدتك");
      const tweetInput = new TextInputBuilder()
        .setCustomId("tweetContent")
        .setLabel("نص التغريدة")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(200)
        .setRequired(true);
      const row = new ActionRowBuilder().addComponents(tweetInput);
      modal.addComponents(row);
      await safeShowModal(interaction, modal);
    }

    if (interaction.customId === "create_account_btn") {
      // فورم إنشاء الحساب
      const modal = new ModalBuilder()
        .setCustomId("create_account_modal")
        .setTitle("إنشاء حساب جديد");
      const nameInput = new TextInputBuilder()
        .setCustomId("account_name")
        .setLabel("اكتب اسم حسابك")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const userInput = new TextInputBuilder()
        .setCustomId("account_user")
        .setLabel("اكتب يوزر حسابك بالإنجليزي (5 أحرف على الأقل)")
        .setStyle(TextInputStyle.Short)
        .setMinLength(5)
        .setRequired(true);
      const avatarInput = new TextInputBuilder()
        .setCustomId("account_avatar")
        .setLabel("رابط صورة الحساب (يجب أن يبدأ بـ http)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const row1 = new ActionRowBuilder().addComponents(nameInput);
      const row2 = new ActionRowBuilder().addComponents(userInput);
      const row3 = new ActionRowBuilder().addComponents(avatarInput);
      modal.addComponents(row1, row2, row3);
      await safeShowModal(interaction, modal);

      // إعادة تعيين المنيو الأصلي في السيرفر
      await resetMenuInAllServers();
    }

    // معالجة أزرار التفاعل
    if (
      interaction.customId.startsWith("like_") ||
      interaction.customId.startsWith("repost_") ||
      interaction.customId.startsWith("save_")
    ) {
      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [action, timestamp] = interaction.customId.split("_");
        const userId = interaction.user.id;

        // تحميل تفاعلات التغريدات
        const interactionsPath = path.join(__dirname, "tweetInteractions.json");
        let tweetInteractions = {};
        if (fs.existsSync(interactionsPath)) {
          tweetInteractions = JSON.parse(
            fs.readFileSync(interactionsPath, "utf8")
          );
        }

        const tweetId = timestamp;
        if (!tweetInteractions[tweetId]) {
          tweetInteractions[tweetId] = {
            likes: [],
            reposts: [],
            saves: [],
          };
        }

        let hasInteracted = false;
        let message = "";

        if (action === "like") {
          const index = tweetInteractions[tweetId].likes.indexOf(userId);
          if (index > -1) {
            tweetInteractions[tweetId].likes.splice(index, 1);
            message = "تم إزالة الإعجاب";
          } else {
            tweetInteractions[tweetId].likes.push(userId);
            message = "تم الإعجاب بالتغريدة";
          }
          hasInteracted = true;
        } else if (action === "repost") {
          const index = tweetInteractions[tweetId].reposts.indexOf(userId);
          if (index > -1) {
            tweetInteractions[tweetId].reposts.splice(index, 1);
            message = "تم إزالة إعادة النشر";
          } else {
            tweetInteractions[tweetId].reposts.push(userId);
            message = "تم إعادة نشر التغريدة";
          }
          hasInteracted = true;
        } else if (action === "save") {
          const index = tweetInteractions[tweetId].saves.indexOf(userId);
          if (index > -1) {
            tweetInteractions[tweetId].saves.splice(index, 1);
            message = "تم إزالة الحفظ";
          } else {
            tweetInteractions[tweetId].saves.push(userId);
            message = "تم حفظ التغريدة";
          }
          hasInteracted = true;
        }

        if (hasInteracted) {
          // حفظ التفاعلات
          fs.writeFileSync(
            interactionsPath,
            JSON.stringify(tweetInteractions, null, 2),
            "utf8"
          );

          // تحديث الصورة
          const updated = await updateTweetImage(
            interaction.message,
            tweetInteractions[tweetId],
            tweetId
          );

          // إذا لم يتم تحديث الصورة (لأن معلومات التغريدة غير موجودة)، استمر في إرسال رسالة النجاح
          await safeInteractionReply(interaction, message);
        }
      } catch (error) {
        console.error("خطأ في معالجة تفاعل التغريدة:", error);
        await safeInteractionReply(interaction, "حدث خطأ أثناء معالجة التفاعل");
      }
    }

    if (
      interaction.customId === "change_avatar" ||
      interaction.customId === "change_username" ||
      interaction.customId === "change_handle"
    ) {
      if (interaction.customId === "change_avatar") {
        const modal = new ModalBuilder()
          .setCustomId("change_avatar_modal")
          .setTitle("تغيير صورة الحساب");
        const avatarInput = new TextInputBuilder()
          .setCustomId("new_avatar_url")
          .setLabel("رابط صورة الحساب الجديدة")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("يجب أن يبدأ بـ http")
          .setRequired(true);
        const row = new ActionRowBuilder().addComponents(avatarInput);
        modal.addComponents(row);
        await safeShowModal(interaction, modal);

        // إعادة تعيين المنيو في جميع السيرفرات
        await resetMenuInAllServers();
      } else if (interaction.customId === "change_username") {
        // فحص الوقت المتبقي قبل إظهار الفورم
        const timeCheck = checkUsernameChangeTime(
          interaction.guild.id,
          interaction.user.id
        );
        if (!timeCheck.canChange) {
          await interaction.reply({
            content: timeCheck.message,
            flags: [MessageFlags.Ephemeral],
          });

          // إعادة تعيين المنيو في جميع السيرفرات
          await resetMenuInAllServers();
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId("change_username_modal")
          .setTitle("تغيير اسم المستخدم");
        const usernameInput = new TextInputBuilder()
          .setCustomId("new_username")
          .setLabel("اسم المستخدم الجديد")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const row = new ActionRowBuilder().addComponents(usernameInput);
        modal.addComponents(row);
        await safeShowModal(interaction, modal);

        // إعادة تعيين المنيو في جميع السيرفرات
        await resetMenuInAllServers();
      } else if (interaction.customId === "change_handle") {
        // فحص الوقت المتبقي قبل إظهار الفورم
        const timeCheck = checkHandleChangeTime(
          interaction.guild.id,
          interaction.user.id
        );
        if (!timeCheck.canChange) {
          await interaction.reply({
            content: timeCheck.message,
            flags: [MessageFlags.Ephemeral],
          });

          // إعادة تعيين المنيو في جميع السيرفرات
          await resetMenuInAllServers();
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId("change_handle_modal")
          .setTitle("تغيير يوزر الحساب");
        const handleInput = new TextInputBuilder()
          .setCustomId("new_handle")
          .setLabel("اليوزر الجديد (5 أحرف على الأقل)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setRequired(true);
        const row = new ActionRowBuilder().addComponents(handleInput);
        modal.addComponents(row);
        await safeShowModal(interaction, modal);

        // إعادة تعيين المنيو في جميع السيرفرات
        await resetMenuInAllServers();
      }
    }
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "wonder_menu") {
      const value = interaction.values[0];

      if (value === "tweet") {
        // التحقق من وجود حساب
        if (!hasAccount(interaction.guild.id, interaction.user.id)) {
          await interaction.reply({
            content: "عذراً الرجاء انشاء حساب لك أولاً",
            flags: [MessageFlags.Ephemeral],
          });
          // إعادة تعيين المنيو في جميع السيرفرات
          await resetMenuInAllServers();
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId("tweetModal")
          .setTitle("اكتب تغريدتك");
        const tweetInput = new TextInputBuilder()
          .setCustomId("tweetContent")
          .setLabel("نص التغريدة")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setRequired(true);
        const row = new ActionRowBuilder().addComponents(tweetInput);
        modal.addComponents(row);
        await safeShowModal(interaction, modal);
        // إعادة تعيين المنيو في جميع السيرفرات
        await resetMenuInAllServers();
      } else if (value === "create_account") {
        // التحقق من وجود حساب مسبق
        if (hasAccount(interaction.guild.id, interaction.user.id)) {
          await interaction.reply({
            content: "لديك حساب مسبق! لا يمكن إنشاء حساب آخر.",
            flags: [MessageFlags.Ephemeral],
          });
          // إعادة تعيين المنيو في جميع السيرفرات
          await resetMenuInAllServers();
          return;
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("create_account_btn")
            .setLabel("انشىء حسابك")
            .setEmoji("1388102721374261258")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          content: `**اضغط على الرابط ادناه وضع الصوره الذي تريدها وخذ رابط مباشر لها (Direct link)\nhttps://postimages.org\n\nملحوظه مهمه : تأكد ان رابط الصوره تنتهي بالصيغ الاتيه\npng\njpg\njpeg**\n\nاضغط على الزر أدناه لإنشاء حسابك بسهولة:`,
          components: [row],
          flags: [MessageFlags.Ephemeral],
        });

        // إعادة تعيين المنيو في جميع السيرفرات
        await resetMenuInAllServers();
      } else if (value === "edit_account") {
        // التحقق من وجود حساب
        if (!hasAccount(interaction.guild.id, interaction.user.id)) {
          await interaction.reply({
            content: "عذراً الرجاء انشاء حساب لك أولاً",
            flags: [MessageFlags.Ephemeral],
          });
          // إعادة تعيين المنيو في جميع السيرفرات
          await resetMenuInAllServers();
          return;
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("change_avatar")
            .setLabel("تغيير صورة الحساب")
            .setEmoji("1388102721374261258")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("change_username")
            .setLabel("تغيير اسم المستخدم")
            .setEmoji("1388102721374261258")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("change_handle")
            .setLabel("تغيير يوزر الحساب")
            .setEmoji("1388102721374261258")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          content: "اختر ما تريد تعديله:",
          components: [row],
          flags: [MessageFlags.Ephemeral],
        });

        // إعادة تعيين المنيو في جميع السيرفرات
        await resetMenuInAllServers();
      }
    } else if (interaction.customId === "verification_type") {
      const verificationType = interaction.values[0];
      const guildId = interaction.guild.id;

      try {
        // قراءة ملف servers.json
        const serversPath = path.join(__dirname, "servers.json");
        let servers = {};
        if (fs.existsSync(serversPath)) {
          servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
        }

        // تهيئة السيرفر إذا لم يكن موجوداً
        if (!servers[guildId]) {
          servers[guildId] = {
            guildName: interaction.guild.name,
            verifiedUsers: {},
          };
        }

        // تهيئة verifiedUsers إذا لم يكن موجوداً
        if (!servers[guildId].verifiedUsers) {
          servers[guildId].verifiedUsers = {};
        }

        // حفظ نوع التوثيق المختار مؤقتاً
        servers[guildId].tempVerificationType = verificationType;
        fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

        const embed = new EmbedBuilder()
          .setTitle("👤 إضافة توثيق")
          .setDescription("منشن الشخص الذي تريد إضافة التوثيق له:")
          .setColor("#131B31")
          .setTimestamp();

        await interaction.update({
          embeds: [embed],
          components: [],
        });
      } catch (error) {
        console.error("خطأ في معالجة اختيار نوع التوثيق:", error);
        await interaction.reply({
          content: "❌ حدث خطأ أثناء معالجة الطلب. يرجى المحاولة مرة أخرى.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
  }
  if (interaction.isModalSubmit() && interaction.customId === "tweetModal") {
    const tweet = interaction.fields.getTextInputValue("tweetContent");
    // قراءة إعدادات السيرفر من servers.json
    const serversPath = path.join(__dirname, "servers.json");
    let servers = {};
    if (fs.existsSync(serversPath)) {
      servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
    }
    const guildId = interaction.guild.id;

    // حفظ اسم السيرفر تلقائيًا إذا لم يكن موجودًا
    if (!servers[guildId] || !servers[guildId].guildName) {
      if (!servers[guildId]) servers[guildId] = {};
      servers[guildId].guildName = interaction.guild.name;
      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2), "utf8");
    }

    if (!servers[guildId] || !servers[guildId].twitterChannelId) {
      if (!interaction.replied && !interaction.deferred) {
        return await interaction.reply({
          content: "لم يتم تعيين روم التغريدات لهذا السيرفر.",
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        return;
      }
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      // الحصول على بيانات الحساب
      const account = getAccount(interaction.guild.id, interaction.user.id);
      if (!account) {
        return await interaction.editReply({
          content: "عذراً الرجاء انشاء حساب لك أولاً",
          flags: [MessageFlags.Ephemeral],
        });
      }

      // تعريف tweetId قبل استخدامه
      const tweetId = Date.now().toString();

      // تعريف interactionRow قبل استخدامه
      const interactionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`like_${tweetId}`)
          .setEmoji("1388397291316052029")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`repost_${tweetId}`)
          .setEmoji("1388397092229222510")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`save_${tweetId}`)
          .setEmoji("1388398085457055804")
          .setStyle(ButtonStyle.Secondary)
      );

      // توليد صورة التغريدة
      const canvas = Canvas.createCanvas(800, 400);
      const ctx = canvas.getContext("2d");
      // الخلفية
      const bg = await Canvas.loadImage(path.join(__dirname, "WTT.jpg"));
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

      // التأكد من وجود جميع الإحداثيات أو استخدام القيم الافتراضية
      const defaultCoords = {
        username: { x: 650, y: 70 },
        username_pos: { x: 300, y: 70 },
        userid: { x: 650, y: 100 },
        avatar: { x: 60, y: 60, size: 50 },
        date: { x: 21, y: 305 },
        guild: { x: 20, y: 380 },
        time: { x: 95, y: 305 },
        guildName: { x: 20, y: 380 },
        interactions: {
          like: { x: 21, y: 308 },
          repost: { x: 95, y: 308 },
          save: { x: 190, y: 308 },
        },
      };

      // دمج الإحداثيات الموجودة مع الافتراضية
      const safeCoords = { ...defaultCoords, ...servers[guildId].coordinates };

      // صورة الحساب المخصصة
      let avatar;
      try {
        // التحقق من تنسيق الصورة قبل التحميل
        if (!isValidImageFormat(account.avatarUrl)) {
          throw new Error("تنسيق الصورة غير مدعوم");
        }

        const processedUrl = convertDiscordAvatarUrl(account.avatarUrl);
        avatar = await Canvas.loadImage(processedUrl);
      } catch (avatarError) {
        console.error(
          `خطأ في تحميل صورة الحساب: ${account.avatarUrl}`,
          avatarError
        );
        // استخدام صورة افتراضية أو رسم دائرة فارغة
        ctx.save();
        ctx.beginPath();
        ctx.arc(
          safeCoords.avatar.x,
          safeCoords.avatar.y,
          safeCoords.avatar.size,
          0,
          Math.PI * 2,
          true
        );
        ctx.closePath();
        ctx.fillStyle = "#666666";
        ctx.fill();
        ctx.restore();

        // رسم حرف أول من اسم المستخدم
        ctx.font = "bold 24px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(
          account.username.charAt(0).toUpperCase(),
          safeCoords.avatar.x,
          safeCoords.avatar.y + 8
        );
      }

      if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(
          safeCoords.avatar.x,
          safeCoords.avatar.y,
          safeCoords.avatar.size,
          0,
          Math.PI * 2,
          true
        );
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          avatar,
          safeCoords.avatar.x - safeCoords.avatar.size,
          safeCoords.avatar.y - safeCoords.avatar.size,
          safeCoords.avatar.size * 2,
          safeCoords.avatar.size * 2
        );
        ctx.restore();
      }

      // اسم المستخدم (بجانب الأفتار)
      ctx.font = "bold 28px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(account.username, 120, 45);

      // التحقق من وجود توثيق للمستخدم
      let hasVerification = false;
      let verificationType = null;

      if (
        servers[guildId] &&
        servers[guildId].verifiedUsers &&
        servers[guildId].verifiedUsers[interaction.user.id]
      ) {
        hasVerification = true;
        verificationType =
          servers[guildId].verifiedUsers[interaction.user.id].type;
        console.log(
          `تم العثور على توثيق للمستخدم ${interaction.user.id}: ${verificationType}`
        );
      }

      // إضافة التوثيق بجانب اسم المستخدم إذا كان موجوداً
      if (hasVerification) {
        const verificationImagePath =
          verificationType === "government"
            ? path.join(__dirname, "2.png")
            : path.join(__dirname, "1.png");

        console.log(`محاولة تحميل صورة التوثيق: ${verificationImagePath}`);

        if (fs.existsSync(verificationImagePath)) {
          console.log(`تم العثور على ملف التوثيق: ${verificationImagePath}`);
          try {
            const verificationImage = await Canvas.loadImage(
              verificationImagePath
            );
            // رسم التوثيق بجانب اسم المستخدم
            const x = 120 + ctx.measureText(account.username).width + 10;
            const y = 25;
            console.log(`رسم التوثيق في الموقع: x=${x}, y=${y}`);
            ctx.drawImage(verificationImage, x, y, 20, 20);
          } catch (verificationError) {
            console.error(
              `خطأ في تحميل صورة التوثيق: ${verificationImagePath}`,
              verificationError
            );
          }
        } else {
          console.log(`ملف التوثيق غير موجود: ${verificationImagePath}`);
        }
      }

      // اليوزر (تحت اسم المستخدم)
      ctx.font = "20px Arial";
      ctx.fillStyle = "#555";
      ctx.textAlign = "left";
      ctx.fillText(`@${account.userHandle}`, 120, 75);

      // نص التغريدة (في المنتصف)
      ctx.font = "28px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      // تحديد اتجاه النص بناءً على اللغة
      const firstChar = tweet.trim()[0];
      const isEnglish = /[a-zA-Z]/.test(firstChar);
      if (isEnglish) {
        wrapText(ctx, tweet, 320, 200, 600, 32);
      } else {
        wrapText(ctx, tweet, 400, 200, 600, 32);
      }

      // إضافة Like, Repost, Save
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";

      // استخدام الإحداثيات من إعدادات السيرفر
      const interactionCoords = safeCoords.interactions || {
        like: { x: 21, y: 308 },
        repost: { x: 95, y: 308 },
        save: { x: 190, y: 308 },
      };

      const tweetDate = new Date(Date.now());
      const date = tweetDate.toLocaleDateString("en-GB");
      const time = tweetDate.toLocaleTimeString("en-US", {
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
      });

      ctx.fillText(
        "Like : 0",
        interactionCoords.like.x,
        interactionCoords.like.y
      );
      ctx.fillText(
        "Repost : 0",
        interactionCoords.repost.x,
        interactionCoords.repost.y
      );
      ctx.fillText(
        "Save : 0",
        interactionCoords.save.x,
        interactionCoords.save.y
      );

      // رسم الوقت والتاريخ
      ctx.textAlign = "left";
      ctx.fillText(
        date,
        interactionCoords.like.x,
        interactionCoords.like.y - 60
      );
      ctx.fillText(
        time,
        interactionCoords.like.x + 100,
        interactionCoords.like.y - 60
      );

      // إرسال الصورة
      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(Buffer.from(buffer), {
        name: "tweet.png",
      });

      // إرسال في الروم المحدد لهذا السيرفر
      const twitterChannel = await interaction.client.channels.fetch(
        servers[guildId].twitterChannelId
      );

      // حفظ معلومات التغريدة
      const tweetInfoPath = path.join(__dirname, "tweetInfo.json");
      let tweetInfoData = {};
      if (fs.existsSync(tweetInfoPath)) {
        tweetInfoData = JSON.parse(fs.readFileSync(tweetInfoPath, "utf8"));
      }
      tweetInfoData[tweetId] = {
        username: account.username,
        userHandle: account.userHandle,
        avatarUrl: account.avatarUrl,
        tweetText: tweet,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        timestamp: Date.now(),
      };
      fs.writeFileSync(
        tweetInfoPath,
        JSON.stringify(tweetInfoData, null, 2),
        "utf8"
      );

      await twitterChannel.send({
        files: [attachment],
        components: [interactionRow],
      });

      await interaction.editReply({ content: "تم نشر تغريدتك بنجاح!" });

      // إعادة تعيين المنيو في جميع السيرفرات
      await resetMenuInAllServers();
    } catch (err) {
      if (!interaction.replied) {
        await interaction.editReply({ content: "حدث خطأ أثناء نشر التغريدة." });
      }
      console.error(err);
    }
  }
  if (
    interaction.isModalSubmit() &&
    (interaction.customId === "create_account_modal" ||
      interaction.customId === "change_avatar_modal" ||
      interaction.customId === "change_username_modal" ||
      interaction.customId === "change_handle_modal")
  ) {
    if (!interaction.guild) {
      return await interaction.reply({
        content: "يجب استخدام هذا الأمر داخل سيرفر.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "create_account_modal"
  ) {
    // التحقق من وجود حساب مسبق
    if (hasAccount(interaction.guild.id, interaction.user.id)) {
      return await interaction.reply({
        content: "لديك حساب مسبق! لا يمكن إنشاء حساب آخر.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // حفظ بيانات الاستبيان مؤقتاً
    const name = interaction.fields.getTextInputValue("account_name");
    const user = interaction.fields.getTextInputValue("account_user");
    const avatarUrl = interaction.fields.getTextInputValue("account_avatar");

    if (!/^[a-zA-Z0-9_]+$/.test(user)) {
      return await interaction.reply({
        content: "اليوزر يجب أن يكون باللغة الإنجليزية فقط!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (!avatarUrl || !avatarUrl.startsWith("http")) {
      return await interaction.reply({
        content: "رابط الصورة يجب أن يبدأ بـ http!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // التحقق من تنسيق الصورة
    if (!isValidImageFormat(avatarUrl)) {
      return await interaction.reply({
        content:
          "تنسيق الصورة غير مدعوم! التنسيقات المدعومة: PNG, JPG, JPEG, GIF, BMP. لا يمكن استخدام WebP أو SVG.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // تحويل رابط Discord إلى تنسيق مدعوم
    const processedAvatarUrl = convertDiscordAvatarUrl(avatarUrl);

    // إنشاء الحساب مباشرة
    try {
      createAccount(
        interaction.guild.id,
        interaction.user.id,
        name,
        user,
        processedAvatarUrl
      );

      await interaction.reply({
        content: "تم انشاء حسابك بنجاح! 🎉",
        flags: [MessageFlags.Ephemeral],
      });

      // إعادة تعيين المنيو في جميع السيرفرات
      await resetMenuInAllServers();
    } catch (error) {
      console.error(`خطأ في إنشاء الحساب:`, error);
      await interaction.reply({
        content: "حدث خطأ أثناء إنشاء الحساب، يرجى المحاولة مرة أخرى.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "change_avatar_modal"
  ) {
    const avatarUrl = interaction.fields.getTextInputValue("new_avatar_url");

    if (!avatarUrl || !avatarUrl.startsWith("http")) {
      return await interaction.reply({
        content: "رابط الصورة يجب أن يبدأ بـ http!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // التحقق من تنسيق الصورة
    if (!isValidImageFormat(avatarUrl)) {
      return await interaction.reply({
        content:
          "تنسيق الصورة غير مدعوم! التنسيقات المدعومة: PNG, JPG, JPEG, GIF, BMP. لا يمكن استخدام WebP أو SVG.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // تحويل رابط Discord إلى تنسيق مدعوم
    const processedAvatarUrl = convertDiscordAvatarUrl(avatarUrl);

    try {
      updateAvatar(
        interaction.guild.id,
        interaction.user.id,
        processedAvatarUrl
      );
      await interaction.reply({
        content: "تم تحديث صورة الحساب بنجاح! 🎉",
        flags: [MessageFlags.Ephemeral],
      });

      // إعادة تعيين المنيو في جميع السيرفرات
      await resetMenuInAllServers();
    } catch (error) {
      console.error(`خطأ في تحديث صورة الحساب:`, error);
      await interaction.reply({
        content: "حدث خطأ أثناء تحديث صورة الحساب، يرجى المحاولة مرة أخرى.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "change_username_modal"
  ) {
    const newUsername = interaction.fields.getTextInputValue("new_username");

    try {
      const result = updateUsername(
        interaction.guild.id,
        interaction.user.id,
        newUsername
      );
      if (result.success) {
        await interaction.reply({
          content: "تم تحديث اسم المستخدم بنجاح! 🎉",
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          content: result.message,
          flags: [MessageFlags.Ephemeral],
        });
      }

      // إعادة تعيين المنيو في جميع السيرفرات
      await resetMenuInAllServers();
    } catch (error) {
      console.error(`خطأ في تحديث اسم المستخدم:`, error);
      await interaction.reply({
        content: "حدث خطأ أثناء تحديث اسم المستخدم، يرجى المحاولة مرة أخرى.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "change_handle_modal"
  ) {
    const newHandle = interaction.fields.getTextInputValue("new_handle");

    if (newHandle.length < 5) {
      return await interaction.reply({
        content: "اليوزر يجب أن يكون 5 أحرف على الأقل",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newHandle)) {
      return await interaction.reply({
        content: "اليوزر يجب أن يكون باللغة الإنجليزية فقط",
        flags: [MessageFlags.Ephemeral],
      });
    }

    try {
      const result = updateHandle(
        interaction.guild.id,
        interaction.user.id,
        newHandle
      );
      if (result.success) {
        await interaction.reply({
          content: "تم تحديث يوزر الحساب بنجاح! 🎉",
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          content: result.message,
          flags: [MessageFlags.Ephemeral],
        });
      }

      // إعادة تعيين المنيو في جميع السيرفرات
      await resetMenuInAllServers();
    } catch (error) {
      console.error(`خطأ في تحديث يوزر الحساب:`, error);
      await interaction.reply({
        content: "حدث خطأ أثناء تحديث يوزر الحساب، يرجى المحاولة مرة أخرى.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (!interaction.isChatInputCommand()) return;
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "-setup") {
    // قراءة إعدادات السيرفر من servers.json
    const serversPath = path.join(__dirname, "servers.json");
    let servers = {};
    if (fs.existsSync(serversPath)) {
      servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
    }
    const guildId = message.guild.id;
    if (!servers[guildId] || !servers[guildId].twitterChannelId) {
      return message.reply(
        "يجب تعيين روم التغريدات أولاً باستخدام أمر السلاش: /تعيين-شات-تويتر"
      );
    }

    const embed = new EmbedBuilder()
      .setTitle("Wonder Twitter")
      .setDescription(
        "**وش تنتظر؟ هذا Wonder Twitter قدامك اختر من القائمة أدناه**"
      )
      .setImage("https://i.postimg.cc/sfPDnSL0/png.jpg");

    const row1 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("wonder_menu")
        .setPlaceholder("اختر من القائمة")
        .addOptions([
          {
            label: "نشر تغريدة",
            description: "نشر تغريدة جديدة",
            value: "tweet",
            emoji: "1388102721374261258",
          },
          {
            label: "انشاء حساب",
            description: "انشاء حساب جديد (سهل وسريع)",
            value: "create_account",
            emoji: "1388102721374261258",
          },
          {
            label: "تعديل الحساب",
            description: "تعديل بيانات الحساب",
            value: "edit_account",
            emoji: "1388102721374261258",
          },
        ])
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("الدعم الفني")
        .setEmoji("1388102721374261258")
        .setStyle(ButtonStyle.Link)
        .setURL("https://discord.gg/XJ4YmQZ4FQ")
    );

    await message.channel.send({ embeds: [embed], components: [row1, row2] });
  }
  if (message.content === "-joinvoice") {
    // قراءة إعدادات السيرفر من servers.json
    const serversPath = path.join(__dirname, "servers.json");
    let servers = {};
    if (fs.existsSync(serversPath)) {
      servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
    }
    const guildId = message.guild.id;
    if (!servers[guildId] || !servers[guildId].voiceChannelId)
      return message.reply(
        "لم يتم تعيين روم الصوت بعد. استخدم أمر السلاش /تعيين-روم-الصوت"
      );
    const channel = await message.guild.channels.fetch(
      servers[guildId].voiceChannelId
    );
    if (!channel || channel.type !== 2)
      return message.reply("روم الصوت غير موجود أو ليس روم صوتي.");
    joinVoiceChannel({
      channelId: channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });
    message.reply(`تم دخول البوت إلى الروم الصوتي: ${channel.name}`);
  }

  if (message.content === "-سيرفرات") {
    // التحقق من أن المستخدم هو مطور
    if (!isDeveloper(message.author.id)) {
      return message.reply("❌ هذا الأمر متاح فقط للمطورين");
    }

    // التحقق من أن الأمر في السيرفر المحدد
    if (message.guild.id !== "1341519094943449240") {
      return; // لا تستجيب للأمر في سيرفرات أخرى
    }

    try {
      // الحصول على جميع السيرفرات التي فيها البوت
      const guilds = client.guilds.cache;

      // تحويل إلى مصفوفة وترتيبها حسب عدد الأعضاء (من الأكبر إلى الأصغر) وأخذ أول 5 فقط
      const sortedGuilds = guilds
        .map((guild) => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          icon: guild.iconURL({ dynamic: true }),
        }))
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 5);

      // إنشاء محتوى القائمة
      let content = "";
      sortedGuilds.forEach((guild, index) => {
        content += `${index + 1}- **${guild.name}** (${
          guild.memberCount
        } عضو)\n`;
      });

      // إنشاء الإمبد
      const embed = new EmbedBuilder()
        .setTitle("السيرفرات")
        .setDescription(content)
        .setColor("#131B31")
        .setImage("https://i.postimg.cc/tCkySM0s/Clean.jpg")
        .setTimestamp();

      // إنشاء زر التحديث
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("refresh_servers")
          .setLabel("تحديث")
          .setEmoji("1388102721374261258")
          .setStyle(ButtonStyle.Primary)
      );

      // إرسال الرسالة
      const response = await message.channel.send({
        embeds: [embed],
        components: [row],
      });

      // إنشاء collector للزر بدون مدة زمنية
      const collector = response.createMessageComponentCollector();

      collector.on("collect", async (interaction) => {
        if (interaction.customId === "refresh_servers") {
          // السماح لأي شخص باستخدام زر التحديث

          await interaction.deferUpdate();

          // تحديث البيانات
          const updatedGuilds = client.guilds.cache;
          const updatedSortedGuilds = updatedGuilds
            .map((guild) => ({
              id: guild.id,
              name: guild.name,
              memberCount: guild.memberCount,
              icon: guild.iconURL({ dynamic: true }),
            }))
            .sort((a, b) => b.memberCount - a.memberCount)
            .slice(0, 5);

          // تحديث المحتوى
          let updatedContent = "";
          updatedSortedGuilds.forEach((guild, index) => {
            updatedContent += `${index + 1}- **${guild.name}** (${
              guild.memberCount
            } عضو)\n`;
          });

          // تحديث الإمبد
          const updatedEmbed = new EmbedBuilder()
            .setTitle("السيرفرات")
            .setDescription(updatedContent)
            .setColor("#131B31")
            .setImage("https://i.postimg.cc/tCkySM0s/Clean.jpg")
            .setTimestamp();

          // تحديث الرسالة
          await response.edit({
            embeds: [updatedEmbed],
            components: [row],
          });
        }
      });
    } catch (error) {
      console.error("خطأ في أمر السيرفرات:", error);
      await message.reply("❌ حدث خطأ أثناء عرض السيرفرات");
    }
  }

  if (message.content === "-help") {
    // الصفحة الرئيسية
    const mainEmbed = new EmbedBuilder()
      .setTitle("Wonder Bot")
      .setDescription(
        "** اهلاً بك في قائمة المساعده لدى Wonder Bot اضغط على القائمه في الاسفل لأستخدام البوت**"
      )
      .setImage("https://i.postimg.cc/G3TG2c81/Clean-20250626-130356.png")
      .setColor(0x0099ff);

    // صفحة السلاش كوماند
    const slashEmbed = new EmbedBuilder()
      .setTitle("Wonder Bot | Slash command")
      .setDescription(
        `1- \`/تعيين-شات-تويتر\` اكتب هذا الأمر و ضع الروم الذي تصل فيه تغريدات الأعضاء 

2- \`/ازالة-شات-تويتر\` لحذف روم التويتر الذي تم تعيينه بواسطة امر (/تعيين-شات-تويتر)

3- \`/تعيين-روم-الصوت\` ضع الروم الذي يتم تثبيت فيه البوت

4- \`/توثيق\` لتوثيق المستخدم او ازالة التوثيق سواءالحكومي او المواطن`
      )
      .setImage("https://i.postimg.cc/G3TG2c81/Clean-20250626-130356.png")
      .setColor(0x0099ff);

    // صفحة الدعم الفني
    const supportEmbed = new EmbedBuilder()
      .setTitle("Wonder Bot | الدعم الفني")
      .setDescription(
        "** سيرفر الدعم الفني في حال واجهتك مشكلة تقنيه https://discord.gg/XJ4YmQZ4FQ\n\nWonder Twitter On Top <:Wonder:1388102721374261258> **"
      )
      .setImage("https://i.postimg.cc/G3TG2c81/Clean-20250626-130356.png")
      .setColor(0x0099ff);

    // القائمة المنسدلة
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_menu")
        .setPlaceholder("اختر القائمة التي تريدها")
        .addOptions([
          {
            label: "القائمة الرئيسية",
            description: "العودة للصفحة الرئيسية",
            value: "help_main",
            emoji: "1388102721374261258",
          },
          {
            label: "السلاش كوماند",
            description: "عرض جميع أوامر السلاش",
            value: "help_slash",
            emoji: "1388102721374261258",
          },
          {
            label: "الدعم الفني",
            description: "رابط سيرفر الدعم الفني",
            value: "help_support",
            emoji: "1388102721374261258",
          },
        ])
    );

    // إرسال الرسالة الأولى
    const response = await message.channel.send({
      embeds: [mainEmbed],
      components: [row],
    });

    // إنشاء collector للقائمة المنسدلة
    const collector = response.createMessageComponentCollector({
      time: 300000, // 5 دقائق
    });

    collector.on("collect", async (i) => {
      let embedToShow;

      switch (i.values[0]) {
        case "help_main":
          embedToShow = mainEmbed;
          break;
        case "help_slash":
          embedToShow = slashEmbed;
          break;
        case "help_support":
          embedToShow = supportEmbed;
          break;
      }

      try {
        await i.update({
          embeds: [embedToShow],
          components: [row],
        });
      } catch (error) {
        console.error("خطأ في تحديث القائمة:", error);
      }
    });

    collector.on("end", () => {
      // إزالة القائمة المنسدلة بعد انتهاء الوقت
      const disabledRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("help_menu")
          .setPlaceholder("انتهت صلاحية القائمة")
          .setDisabled(true)
          .addOptions([
            {
              label: "القائمة الرئيسية",
              description: "العودة للصفحة الرئيسية",
              value: "help_main",
              emoji: "1388102721374261258",
            },
            {
              label: "السلاش كوماند",
              description: "عرض جميع أوامر السلاش",
              value: "help_slash",
              emoji: "1388102721374261258",
            },
            {
              label: "الدعم الفني",
              description: "رابط سيرفر الدعم الفني",
              value: "help_support",
              emoji: "1388102721374261258",
            },
          ])
      );

      response
        .edit({
          embeds: [mainEmbed],
          components: [disabledRow],
        })
        .catch(console.error);
    });
  }

  // أمر say لإرسال رسالة
  if (message.content.startsWith("-say ")) {
    // التحقق من أن المستخدم هو مطور
    if (!isDeveloper(message.author.id)) {
      return message.reply("❌ هذا الأمر متاح فقط للمطورين");
    }

    // التحقق من أن الأمر في السيرفر المحدد
    if (message.guild.id !== "1341519094943449240") {
      return; // لا تستجيب للأمر في سيرفرات أخرى
    }

    // حذف الرسالة الأصلية
    await message.delete().catch(console.error);

    // استخراج النص المراد إرساله
    const textToSay = message.content.slice(5); // حذف "-say " من بداية الرسالة

    if (!textToSay.trim()) {
      return message.channel.send("❌ يرجى كتابة نص لإرساله").then((msg) => {
        setTimeout(() => msg.delete().catch(console.error), 3000);
      });
    }

    // إرسال النص
    await message.channel.send(textToSay);
  }

  // معالجة المنشنات للتوثيق
  if (message.mentions.users.size > 0) {
    const guildId = message.guild.id;
    const serversPath = path.join(__dirname, "servers.json");

    if (fs.existsSync(serversPath)) {
      const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));

      if (servers[guildId] && servers[guildId].tempVerificationType) {
        const verificationType = servers[guildId].tempVerificationType;
        const mentionedUser = message.mentions.users.first();

        // التحقق من صلاحيات المستخدم
        if (
          !message.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return message.reply(
            "يجب أن تملك صلاحية إدارة السيرفر لاستخدام هذا الأمر."
          );
        }

        try {
          // تهيئة verifiedUsers إذا لم يكن موجوداً
          if (!servers[guildId].verifiedUsers) {
            servers[guildId].verifiedUsers = {};
          }

          // إضافة التوثيق للمستخدم
          servers[guildId].verifiedUsers[mentionedUser.id] = {
            type: verificationType,
            verifiedAt: new Date().toISOString(),
            verifiedBy: message.author.id,
          };

          // حذف نوع التوثيق المؤقت
          delete servers[guildId].tempVerificationType;

          // حفظ البيانات
          fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

          const embed = new EmbedBuilder()
            .setTitle("✅ تم إضافة التوثيق بنجاح")
            .setDescription(
              `تم إضافة توثيق ${
                verificationType === "government" ? "حكومي" : "مواطن"
              } للمستخدم ${mentionedUser}`
            )
            .setColor("#131B31")
            .setTimestamp();

          await message.reply({ embeds: [embed] });
        } catch (error) {
          console.error("خطأ في إضافة التوثيق:", error);
          await message.reply(
            "❌ حدث خطأ أثناء إضافة التوثيق. يرجى المحاولة مرة أخرى."
          );
        }
      } else if (servers[guildId] && servers[guildId].removeVerificationMode) {
        // وضع إزالة التوثيق
        const mentionedUser = message.mentions.users.first();

        // التحقق من صلاحيات المستخدم
        if (
          !message.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return message.reply(
            "يجب أن تملك صلاحية إدارة السيرفر لاستخدام هذا الأمر."
          );
        }

        try {
          if (
            servers[guildId].verifiedUsers &&
            servers[guildId].verifiedUsers[mentionedUser.id]
          ) {
            // إزالة التوثيق
            delete servers[guildId].verifiedUsers[mentionedUser.id];

            // حذف وضع الإزالة
            delete servers[guildId].removeVerificationMode;

            // حفظ البيانات
            fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

            const embed = new EmbedBuilder()
              .setTitle("🗑️ تم إزالة التوثيق بنجاح")
              .setDescription(`تم إزالة التوثيق من المستخدم ${mentionedUser}`)
              .setColor("#131B31")
              .setTimestamp();

            await message.reply({ embeds: [embed] });
          } else {
            await message.reply("❌ هذا المستخدم ليس لديه توثيق لإزالته.");
          }
        } catch (error) {
          console.error("خطأ في إزالة التوثيق:", error);
          await message.reply(
            "❌ حدث خطأ أثناء إزالة التوثيق. يرجى المحاولة مرة أخرى."
          );
        }
      }
    }
  }

  // أوامر ضبط الإحداثيات
  if (message.content.startsWith("-ضبط-احداثيات")) {
    // التحقق من أن المستخدم هو مطور
    if (!isDeveloper(message.author.id)) {
      return message.reply("❌ هذا الأمر متاح فقط للمطورين");
    }

    const args = message.content.split(" ");
    if (args.length < 3) {
      return message.reply(`
**أمر ضبط الإحداثيات:**
\`-ضبط-احداثيات اسم-العنصر x y\`

**العناصر المتاحة:**
• \`username\` - اسم المستخدم
• \`userid\` - معرف المستخدم  
• \`avatar\` - صورة الحساب
• \`date\` - التاريخ
• \`time\` - الوقت
• \`guild\` - اسم السيرفر
• \`verification\` - شارة التوثيق
• \`like\` - زر الإعجاب
• \`repost\` - زر إعادة التغريد
• \`save\` - زر الحفظ

**مثال:**
\`-ضبط-احداثيات username 120 45\`
      `);
    }

    const element = args[1];
    const x = parseInt(args[2]);
    const y = parseInt(args[3]);

    if (isNaN(x) || isNaN(y)) {
      return message.reply("❌ يجب أن تكون الإحداثيات أرقام صحيحة");
    }

    const guildId = message.guild.id;
    const serversPath = path.join(__dirname, "servers.json");

    let servers = {};
    if (fs.existsSync(serversPath)) {
      servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
    }

    // تهيئة إعدادات السيرفر إذا لم تكن موجودة
    if (!servers[guildId]) {
      servers[guildId] = {};
    }
    if (!servers[guildId].coordinates) {
      servers[guildId].coordinates = {};
    }

    // حفظ الإحداثيات
    servers[guildId].coordinates[element] = { x, y };
    fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

    const embed = new EmbedBuilder()
      .setTitle("✅ تم ضبط الإحداثيات بنجاح")
      .setDescription(
        `تم ضبط إحداثيات \`${element}\` إلى: **x: ${x}, y: ${y}**`
      )
      .setColor("#131B31")
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }

  // أمر عرض الإحداثيات الحالية
  if (message.content === "-احداثيات") {
    const guildId = message.guild.id;
    const serversPath = path.join(__dirname, "servers.json");

    if (!fs.existsSync(serversPath)) {
      return message.reply("❌ لا توجد إحداثيات محفوظة لهذا السيرفر");
    }

    const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));

    if (!servers[guildId] || !servers[guildId].coordinates) {
      return message.reply("❌ لا توجد إحداثيات محفوظة لهذا السيرفر");
    }

    const coords = servers[guildId].coordinates;
    let content = "**الإحداثيات المحفوظة:**\n\n";

    Object.keys(coords).forEach((element) => {
      content += `• \`${element}\`: **x: ${coords[element].x}, y: ${coords[element].y}**\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle("📍 إحداثيات السيرفر")
      .setDescription(content)
      .setColor("#131B31")
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }

  // أمر إعادة تعيين الإحداثيات للقيم الافتراضية
  if (message.content === "-اعادة-احداثيات") {
    // التحقق من أن المستخدم هو مطور
    if (!isDeveloper(message.author.id)) {
      return message.reply("❌ هذا الأمر متاح فقط للمطورين");
    }

    const guildId = message.guild.id;
    const serversPath = path.join(__dirname, "servers.json");

    if (!fs.existsSync(serversPath)) {
      return message.reply("❌ لا توجد إحداثيات محفوظة لهذا السيرفر");
    }

    const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));

    if (servers[guildId] && servers[guildId].coordinates) {
      delete servers[guildId].coordinates;
      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

      const embed = new EmbedBuilder()
        .setTitle("🔄 تم إعادة تعيين الإحداثيات")
        .setDescription(
          "تم حذف جميع الإحداثيات المخصصة والعودة للقيم الافتراضية"
        )
        .setColor("#131B31")
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } else {
      await message.reply("❌ لا توجد إحداثيات محفوظة لهذا السيرفر");
    }
  }

  // أمر اختبار الإحداثيات
  if (message.content === "-اختبار-احداثيات") {
    // التحقق من أن المستخدم هو مطور
    if (!isDeveloper(message.author.id)) {
      return message.reply("❌ هذا الأمر متاح فقط للمطورين");
    }

    try {
      // إنشاء حساب تجريبي للاختبار
      const testAccount = {
        username: "مستخدم تجريبي",
        userHandle: "test_user",
        avatarUrl: message.author.displayAvatarURL({ extension: "png" }),
      };

      // إنشاء صورة تجريبية باستخدام الإحداثيات الحالية
      const testImage = await generateTweetPreview(
        testAccount,
        message.guild,
        {},
        message.author.id
      );

      const attachment = new AttachmentBuilder(testImage, {
        name: "test_coordinates.png",
      });

      const embed = new EmbedBuilder()
        .setTitle("🧪 اختبار الإحداثيات")
        .setDescription("هذه صورة تجريبية باستخدام الإحداثيات الحالية للسيرفر")
        .setColor("#131B31")
        .setTimestamp();

      await message.reply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error("خطأ في اختبار الإحداثيات:", error);
      await message.reply("❌ حدث خطأ أثناء إنشاء الصورة التجريبية");
    }
  }

  // أمر تطبيق الإحداثيات الافتراضية على جميع السيرفرات
  if (message.content === "-تطبيق-احداثيات-جميع-السيرفرات") {
    // التحقق من أن المستخدم هو مطور
    if (!isDeveloper(message.author.id)) {
      return message.reply("❌ هذا الأمر متاح فقط للمطورين");
    }

    try {
      const serversPath = path.join(__dirname, "servers.json");
      if (!fs.existsSync(serversPath)) {
        return message.reply("❌ لا توجد سيرفرات محفوظة");
      }

      const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
      let updatedCount = 0;

      // الإحداثيات الافتراضية
      const defaultCoordinates = {
        username: { x: 120, y: 45 },
        userid: { x: 120, y: 75 },
        avatar: { x: 60, y: 60, size: 50 },
        date: { x: 21, y: 245 },
        time: { x: 121, y: 245 },
        verification: { x: 130, y: 25 },
        like: { x: 21, y: 308 },
        repost: { x: 95, y: 308 },
        save: { x: 190, y: 308 },
      };

      // تطبيق الإحداثيات على جميع السيرفرات
      for (const guildId in servers) {
        if (guildId === "default") continue;

        if (!servers[guildId].coordinates) {
          servers[guildId].coordinates = { ...defaultCoordinates };
          updatedCount++;
        }
      }

      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2), "utf8");

      const embed = new EmbedBuilder()
        .setTitle("✅ تم تطبيق الإحداثيات الافتراضية")
        .setDescription(
          `تم تطبيق الإحداثيات الافتراضية على ${updatedCount} سيرفر`
        )
        .setColor("#131B31")
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("خطأ في تطبيق الإحداثيات:", error);
      await message.reply("❌ حدث خطأ أثناء تطبيق الإحداثيات");
    }
  }
});

client.login(config.BOT_TOKEN);

// مراقبة حالة الاتصال الصوتي وإعادة الاتصال التلقائي
client.on("voiceStateUpdate", async (oldState, newState) => {
  // إذا كان البوت هو من غادر الروم
  if (oldState.member.id === client.user.id && newState.channelId === null) {
    // محاولة إعادة الاتصال بعد 5 ثواني
    setTimeout(async () => {
      try {
        const serversPath = path.join(__dirname, "servers.json");
        if (!fs.existsSync(serversPath)) return;

        const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
        const guildId = oldState.guild.id;

        if (servers[guildId] && servers[guildId].voiceChannelId) {
          const channel = await oldState.guild.channels.fetch(
            servers[guildId].voiceChannelId
          );
          if (channel && channel.type === 2) {
            const connection = getVoiceConnection(guildId);
            if (!connection) {
              joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
              });
            }
          }
        }
      } catch (error) {
        // تجاهل الأخطاء في إعادة الاتصال التلقائي
      }
    }, 5000);
  }
});

// دالة للفحص الدوري للاتصالات الصوتية
function startVoiceConnectionMonitor() {
  setInterval(async () => {
    try {
      const serversPath = path.join(__dirname, "servers.json");
      if (!fs.existsSync(serversPath)) return;

      const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));

      for (const guildId in servers) {
        const serverConfig = servers[guildId];
        if (serverConfig.voiceChannelId) {
          try {
            const guild = await client.guilds.fetch(guildId);
            if (!guild) continue;

            const connection = getVoiceConnection(guildId);
            if (!connection) {
              // إذا لم يكن هناك اتصال، حاول إعادة الاتصال
              const channel = await guild.channels.fetch(
                serverConfig.voiceChannelId
              );
              if (channel && channel.type === 2) {
                joinVoiceChannel({
                  channelId: channel.id,
                  guildId: guild.id,
                  adapterCreator: guild.voiceAdapterCreator,
                });
              }
            }
          } catch (error) {
            // تجاهل الأخطاء في الفحص الدوري
          }
        }
      }
    } catch (error) {
      // تجاهل الأخطاء في الفحص الدوري
    }
  }, 30000); // فحص كل 30 ثانية
}

// دالة لتوليد صورة التغريدة مع الإحداثيات المحددة
async function generateTweetPreview(account, guild, coords, userId) {
  const canvas = Canvas.createCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  // الخلفية
  const bg = await Canvas.loadImage(path.join(__dirname, "WTT.jpg"));
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

  // الحصول على الإحداثيات المخصصة للسيرفر
  const guildServersPath = path.join(__dirname, "servers.json");
  let serverCoords = {};

  if (fs.existsSync(guildServersPath)) {
    const servers = JSON.parse(fs.readFileSync(guildServersPath, "utf8"));
    const guildId = guild.id;

    if (servers[guildId] && servers[guildId].coordinates) {
      serverCoords = servers[guildId].coordinates;
    }
  }

  // التأكد من وجود جميع الإحداثيات أو استخدام القيم الافتراضية
  const defaultCoords = {
    username: { x: 120, y: 45 },
    userid: { x: 120, y: 75 },
    avatar: { x: 60, y: 60, size: 50 },
    date: { x: 21, y: 245 },
    time: { x: 121, y: 245 },
    verification: { x: 130, y: 25 },
    like: { x: 21, y: 308 },
    repost: { x: 95, y: 308 },
    save: { x: 190, y: 308 },
  };

  // دمج الإحداثيات: الافتراضية + المخصصة للسيرفر + المخصصة للاستدعاء
  const safeCoords = { ...defaultCoords, ...serverCoords, ...coords };

  // صورة الحساب المخصصة
  let avatar;
  try {
    // التحقق من تنسيق الصورة قبل التحميل
    if (!isValidImageFormat(account.avatarUrl)) {
      throw new Error("تنسيق الصورة غير مدعوم");
    }

    const processedUrl = convertDiscordAvatarUrl(account.avatarUrl);
    avatar = await Canvas.loadImage(processedUrl);
  } catch (avatarError) {
    console.error(
      `خطأ في تحميل صورة الحساب: ${account.avatarUrl}`,
      avatarError
    );
    // استخدام صورة افتراضية أو رسم دائرة فارغة
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      safeCoords.avatar.x,
      safeCoords.avatar.y,
      safeCoords.avatar.size,
      0,
      Math.PI * 2,
      true
    );
    ctx.closePath();
    ctx.fillStyle = "#666666";
    ctx.fill();
    ctx.restore();

    // رسم حرف أول من اسم المستخدم
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(
      account.username.charAt(0).toUpperCase(),
      safeCoords.avatar.x,
      safeCoords.avatar.y + 8
    );
  }

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      safeCoords.avatar.x,
      safeCoords.avatar.y,
      safeCoords.avatar.size,
      0,
      Math.PI * 2,
      true
    );
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      avatar,
      safeCoords.avatar.x - safeCoords.avatar.size,
      safeCoords.avatar.y - safeCoords.avatar.size,
      safeCoords.avatar.size * 2,
      safeCoords.avatar.size * 2
    );
    ctx.restore();
  }

  // اسم المستخدم (بجانب الأفتار)
  ctx.font = "bold 28px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(account.username, safeCoords.username.x, safeCoords.username.y);

  // التحقق من وجود توثيق للمستخدم
  const verificationServersPath = path.join(__dirname, "servers.json");
  let hasVerification = false;
  let verificationType = null;

  if (fs.existsSync(verificationServersPath)) {
    const servers = JSON.parse(
      fs.readFileSync(verificationServersPath, "utf8")
    );
    const guildId = guild.id;

    if (
      servers[guildId] &&
      servers[guildId].verifiedUsers &&
      servers[guildId].verifiedUsers[userId]
    ) {
      hasVerification = true;
      verificationType = servers[guildId].verifiedUsers[userId].type;
    }
  }

  // إضافة التوثيق بجانب اسم المستخدم إذا كان موجوداً
  if (hasVerification) {
    const verificationImagePath =
      verificationType === "government"
        ? path.join(__dirname, "2.png")
        : path.join(__dirname, "1.png");

    if (fs.existsSync(verificationImagePath)) {
      try {
        const verificationImage = await Canvas.loadImage(verificationImagePath);
        // رسم التوثيق بجانب اسم المستخدم باستخدام الإحداثيات المخصصة
        const verificationX = safeCoords.verification
          ? safeCoords.verification.x
          : safeCoords.username.x +
            ctx.measureText(account.username).width +
            10;
        const verificationY = safeCoords.verification
          ? safeCoords.verification.y
          : safeCoords.username.y - 20;
        ctx.drawImage(verificationImage, verificationX, verificationY, 20, 20);
      } catch (verificationError) {
        console.error(
          `خطأ في تحميل صورة التوثيق: ${verificationImagePath}`,
          verificationError
        );
      }
    }
  }

  // اليوزر (تحت اسم المستخدم)
  ctx.font = "20px Arial";
  ctx.fillStyle = "#555";
  ctx.textAlign = "left";
  ctx.fillText(
    `@${account.userHandle}`,
    safeCoords.userid.x,
    safeCoords.userid.y
  );

  // نص التغريدة (في المنتصف)
  ctx.font = "28px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  wrapText(ctx, "نص تجريبي للتغريدة", 400, 200, 600, 32);

  // إضافة Like, Repost, Save
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";

  ctx.fillText("Like : 0", safeCoords.like.x, safeCoords.like.y);
  ctx.fillText("Repost : 0", safeCoords.repost.x, safeCoords.repost.y);
  ctx.fillText("Save : 0", safeCoords.save.x, safeCoords.save.y);

  // رسم الوقت والتاريخ
  const tweetDate = new Date(Date.now());
  const date = tweetDate.toLocaleDateString("en-GB");
  const time = tweetDate.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.textAlign = "left";
  ctx.fillText(date, safeCoords.date.x, safeCoords.date.y);
  ctx.fillText(time, safeCoords.time.x, safeCoords.time.y);

  return canvas.toBuffer("image/png");
}

// دالة لفصل النص تلقائياً (للمنتصف)
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  // تحديد اتجاه النص بناءً على اللغة
  const firstChar = text.trim()[0];
  const isArabic = /[\u0600-\u06FF]/.test(firstChar);
  const isEnglish = /[a-zA-Z]/.test(firstChar);

  if (isArabic) {
    ctx.textAlign = "right";
    const words = text.split(" ");
    let line = "";
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x + maxWidth / 2, currentY);
        line = words[n] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x + maxWidth / 2, currentY);
  } else {
    ctx.textAlign = "left";
    const words = text.split(" ");
    let line = "";
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x - maxWidth / 2, currentY);
        line = words[n] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x - maxWidth / 2, currentY);
  }
}

// دالة للدخول التلقائي للرومات الصوتية المحدةدة
async function joinConfiguredVoiceChannels() {
  try {
    const serversPath = path.join(__dirname, "servers.json");
    if (!fs.existsSync(serversPath)) {
      return;
    }

    const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));

    for (const guildId in servers) {
      const serverConfig = servers[guildId];
      if (serverConfig.voiceChannelId) {
        try {
          const guild = await client.guilds.fetch(guildId);
          if (!guild) {
            continue;
          }

          const channel = await guild.channels.fetch(
            serverConfig.voiceChannelId
          );
          if (!channel || channel.type !== 2) {
            continue;
          }

          // التحقق من عدم وجود اتصال صوتي موجود
          const existingConnection = getVoiceConnection(guildId);
          if (existingConnection) {
            continue;
          }

          // الدخول للروم الصوتي
          joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
          });
        } catch (error) {
          // تجاهل الأخطاء في الدخول التلقائي
        }
      }
    }
  } catch (error) {
    console.error("خطأ في قراءة إعدادات السيرفرات:", error);
  }
}

// دالة مساعدة لحفظ اسم السيرفر في servers.json
function saveGuildName(guildId, name) {
  const serversPath = path.join(__dirname, "servers.json");
  let servers = {};
  if (fs.existsSync(serversPath)) {
    servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
  }
  if (!servers[guildId]) servers[guildId] = {};
  servers[guildId].guildName = name;

  // تطبيق الإحداثيات الافتراضية إذا لم تكن موجودة
  if (!servers[guildId].coordinates) {
    servers[guildId].coordinates = {
      username: { x: 120, y: 45 },
      userid: { x: 120, y: 75 },
      avatar: { x: 60, y: 60, size: 50 },
      date: { x: 21, y: 245 },
      time: { x: 121, y: 245 },
      verification: { x: 130, y: 25 },
      like: { x: 21, y: 308 },
      repost: { x: 95, y: 308 },
      save: { x: 190, y: 308 },
    };
  }

  fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2), "utf8");
}

// عند دخول البوت سيرفر جديد
client.on("guildCreate", (guild) => {
  saveGuildName(guild.id, guild.name);
});

// عند تغيير اسم السيرفر
client.on("guildUpdate", (oldGuild, newGuild) => {
  if (oldGuild.name !== newGuild.name) {
    saveGuildName(newGuild.id, newGuild.name);
  }
});

// دالة تحديث صورة التغريدة مع أرقام التفاعل
async function updateTweetImage(message, interactions, tweetId) {
  try {
    // تحميل معلومات التغريدة
    const tweetInfoPath = path.join(__dirname, "tweetInfo.json");
    if (!fs.existsSync(tweetInfoPath)) {
      // ملف معلومات التغريدات غير موجود، تجاهل التحديث
      return false;
    }

    const tweetInfoData = JSON.parse(fs.readFileSync(tweetInfoPath, "utf8"));
    const tweetInfo = tweetInfoData[tweetId];

    if (!tweetInfo) {
      // معلومات التغريدة غير موجودة، تجاهل التحديث
      return false;
    }

    const canvas = Canvas.createCanvas(800, 400);
    const ctx = canvas.getContext("2d");

    // رسم الخلفية
    const bg = await Canvas.loadImage(path.join(__dirname, "WTT.jpg"));
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // صورة الحساب
    let avatar;
    try {
      if (!isValidImageFormat(tweetInfo.avatarUrl)) {
        throw new Error("تنسيق الصورة غير مدعوم");
      }
      const processedUrl = convertDiscordAvatarUrl(tweetInfo.avatarUrl);
      avatar = await Canvas.loadImage(processedUrl);
    } catch (avatarError) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(60, 60, 50, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = "#666666";
      ctx.fill();
      ctx.restore();
      ctx.font = "bold 24px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(tweetInfo.username.charAt(0).toUpperCase(), 60, 68);
    }
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(60, 60, 50, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, 10, 10, 100, 100);
      ctx.restore();
    }

    // اسم المستخدم (بجانب الأفتار)
    ctx.font = "bold 28px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(tweetInfo.username, 120, 45);

    // شارة التوثيق بجانب الاسم
    // التحقق من وجود توثيق للمستخدم
    const serversPath = path.join(__dirname, "servers.json");
    let hasVerification = false;
    let verificationType = null;
    if (fs.existsSync(serversPath)) {
      const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
      const guildId = message.guild.id;
      if (
        servers[guildId] &&
        servers[guildId].verifiedUsers &&
        servers[guildId].verifiedUsers[tweetInfo.userId]
      ) {
        hasVerification = true;
        verificationType =
          servers[guildId].verifiedUsers[tweetInfo.userId].type;
      }
    }
    if (hasVerification) {
      const verificationImagePath =
        verificationType === "government"
          ? path.join(__dirname, "2.png")
          : path.join(__dirname, "1.png");
      if (fs.existsSync(verificationImagePath)) {
        try {
          const verificationImage = await Canvas.loadImage(
            verificationImagePath
          );
          const x = 120 + ctx.measureText(tweetInfo.username).width + 10;
          const y = 25;
          ctx.drawImage(verificationImage, x, y, 20, 20);
        } catch {}
      }
    }

    // اليوزر (تحت اسم المستخدم)
    ctx.font = "20px Arial";
    ctx.fillStyle = "#555";
    ctx.textAlign = "left";
    ctx.fillText(`@${tweetInfo.userHandle}`, 120, 75);

    // نص التغريدة (في المنتصف)
    ctx.font = "28px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    // تحديد اتجاه النص بناءً على اللغة
    const firstChar2 = tweetInfo.tweetText.trim()[0];
    const isEnglish2 = /[a-zA-Z]/.test(firstChar2);
    if (isEnglish2) {
      wrapText(ctx, tweetInfo.tweetText, 320, 200, 600, 32);
    } else {
      wrapText(ctx, tweetInfo.tweetText, 400, 200, 600, 32);
    }

    // أزرار التفاعل
    ctx.font = "bold 16px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    const likesCount = interactions.likes.length;
    const repostsCount = interactions.reposts.length;
    const savesCount = interactions.saves.length;
    ctx.fillText(`Like : ${likesCount}`, 21, 308);
    ctx.fillText(`Repost : ${repostsCount}`, 95, 308);
    ctx.fillText(`Save : ${savesCount}`, 190, 308);

    // الوقت والتاريخ فوق أزرار التفاعل
    const tweetDate = new Date(Date.now());
    const date = tweetDate.toLocaleDateString("en-GB");
    const time = tweetDate.toLocaleTimeString("en-US", {
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
    });
    ctx.textAlign = "left";
    ctx.fillText(date, 21, 248);
    ctx.fillText(time, 121, 248);

    // إرسال الصورة
    const buffer = canvas.toBuffer("image/png");
    const attachment = new AttachmentBuilder(Buffer.from(buffer), {
      name: "tweet.png",
    });
    await message.edit({ files: [attachment] });
    return true;
  } catch (error) {
    console.error("خطأ في تحديث صورة التغريدة:", error);
    return false;
  }
}

// دالة تنظيف البيانات القديمة
function cleanupOldTweetData() {
  try {
    const tweetInfoPath = path.join(__dirname, "tweetInfo.json");
    const interactionsPath = path.join(__dirname, "tweetInteractions.json");

    if (fs.existsSync(tweetInfoPath)) {
      const tweetInfoData = JSON.parse(fs.readFileSync(tweetInfoPath, "utf8"));
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000; // 24 ساعة

      // حذف التغريدات الأقدم من 24 ساعة
      const cleanedData = {};
      for (const [tweetId, tweetInfo] of Object.entries(tweetInfoData)) {
        if (tweetInfo.timestamp > oneDayAgo) {
          cleanedData[tweetId] = tweetInfo;
        }
      }

      fs.writeFileSync(
        tweetInfoPath,
        JSON.stringify(cleanedData, null, 2),
        "utf8"
      );
    }

    if (fs.existsSync(interactionsPath)) {
      const interactionsData = JSON.parse(
        fs.readFileSync(interactionsPath, "utf8")
      );
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // حذف التفاعلات الأقدم من 24 ساعة
      const cleanedInteractions = {};
      for (const [tweetId, interactions] of Object.entries(interactionsData)) {
        // نتحقق من وجود التغريدة في tweetInfo
        if (fs.existsSync(tweetInfoPath)) {
          const tweetInfoData = JSON.parse(
            fs.readFileSync(tweetInfoPath, "utf8")
          );
          if (tweetInfoData[tweetId]) {
            cleanedInteractions[tweetId] = interactions;
          }
        }
      }

      fs.writeFileSync(
        interactionsPath,
        JSON.stringify(cleanedInteractions, null, 2),
        "utf8"
      );
    }
  } catch (error) {
    console.error("خطأ في تنظيف البيانات القديمة:", error);
  }
}

// دالة تنظيف الروابط القديمة
async function cleanupOldAvatarUrls() {
  try {
    const accountsPath = path.join(__dirname, "accounts.json");
    if (!fs.existsSync(accountsPath)) return;

    const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
    let updated = false;

    for (const [userId, account] of Object.entries(accounts)) {
      if (account.avatarUrl) {
        // التحقق من تنسيق الصورة أولاً
        if (!isValidImageFormat(account.avatarUrl)) {
          console.log(
            `🗑️ حذف رابط صورة بتنسيق غير مدعوم للمستخدم ${userId}: ${account.avatarUrl}`
          );
          delete accounts[userId].avatarUrl;
          updated = true;
          continue;
        }

        // تحويل رابط Discord إلى تنسيق مدعوم
        const processedUrl = convertDiscordAvatarUrl(account.avatarUrl);
        if (processedUrl !== account.avatarUrl) {
          accounts[userId].avatarUrl = processedUrl;
          updated = true;
          console.log(
            `🔄 تحديث رابط صورة للمستخدم ${userId}: ${account.avatarUrl} -> ${processedUrl}`
          );
        }

        // التحقق من صحة الرابط
        if (account.avatarUrl.includes("cdn.discordapp.com")) {
          try {
            // التحقق من تنسيق الصورة قبل التحميل
            if (!isValidImageFormat(account.avatarUrl)) {
              throw new Error("تنسيق الصورة غير مدعوم");
            }

            const processedUrl = convertDiscordAvatarUrl(account.avatarUrl);
            // محاولة تحميل الصورة للتحقق من صحتها
            await Canvas.loadImage(processedUrl);
          } catch (error) {
            console.log(
              `🗑️ حذف رابط صورة قديم للمستخدم ${userId}: ${account.avatarUrl}`
            );
            // حذف الرابط القديم
            delete accounts[userId].avatarUrl;
            updated = true;
          }
        }
      }
    }

    if (updated) {
      fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2), "utf8");
      console.log("✅ تم تنظيف الروابط القديمة بنجاح");
    } else {
      console.log("✅ لا توجد روابط قديمة تحتاج للتنظيف");
    }
  } catch (error) {
    console.error("خطأ في تنظيف الروابط القديمة:", error);
  }
}

// دالة لتطبيق الإعدادات الجديدة على جميع السيرفرات
function applyNewSettingsToAllServers() {
  try {
    const serversPath = path.join(__dirname, "servers.json");
    if (!fs.existsSync(serversPath)) {
      return;
    }

    const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
    let updated = false;

    // الإحداثيات الافتراضية الجديدة
    const defaultCoordinates = {
      username: { x: 120, y: 45 },
      userid: { x: 120, y: 75 },
      avatar: { x: 60, y: 60, size: 50 },
      date: { x: 21, y: 245 },
      time: { x: 121, y: 245 },
      verification: { x: 130, y: 25 },
      like: { x: 21, y: 308 },
      repost: { x: 95, y: 308 },
      save: { x: 190, y: 308 },
    };

    // تطبيق الإحداثيات على جميع السيرفرات التي لا تملك إحداثيات
    for (const guildId in servers) {
      if (guildId === "default") continue; // تخطي الإعدادات الافتراضية

      if (!servers[guildId].coordinates) {
        servers[guildId].coordinates = { ...defaultCoordinates };
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2), "utf8");
      console.log("✅ تم تطبيق الإحداثيات الافتراضية على السيرفرات الجديدة");
    }
  } catch (error) {
    console.error("خطأ في تطبيق الإعدادات الجديدة:", error);
  }
}

// تشغيل التنظيف كل ساعة
setInterval(cleanupOldTweetData, 60 * 60 * 1000);

// تنظيف الروابط القديمة كل 6 ساعات
setInterval(cleanupOldAvatarUrls, 6 * 60 * 60 * 1000);

// دالة لإعادة تعيين المنيو في جميع السيرفرات
async function resetMenuInAllServers() {
  try {
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      const channels = guild.channels.cache.filter((ch) => ch.type === 0); // 0 = text channels
      for (const [channelId, channel] of channels) {
        try {
          const messages = await channel.messages.fetch({ limit: 50 });
          const menuMessage = messages.find(
            (msg) =>
              msg.components.length > 0 &&
              msg.components[0].components.some(
                (comp) => comp.customId === "wonder_menu"
              )
          );
          if (menuMessage) {
            await menuMessage.edit(createResetMenu());
            break;
          }
        } catch (error) {
          // تجاهل الأخطاء في القنوات التي لا يمكن الوصول إليها
          continue;
        }
      }
    }
  } catch (error) {
    console.error("خطأ في إعادة تعيين المنيو في جميع السيرفرات:", error);
  }
}

// دالة لإعادة تعيين المنيو
function createResetMenu() {
  const embed = new EmbedBuilder()
    .setTitle("Wonder Twitter")
    .setDescription(
      "**وش تنتظر؟ هذا Wonder Twitter قدامك اختر من القائمة أدناه**"
    )
    .setImage("https://i.postimg.cc/G3TG2c81/Clean-20250626-130356.png");

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("wonder_menu")
      .setPlaceholder("اختر من القائمة")
      .addOptions([
        {
          label: "نشر تغريدة",
          description: "نشر تغريدة جديدة",
          value: "tweet",
          emoji: "1388102721374261258",
        },
        {
          label: "انشاء حساب",
          description: "انشاء حساب جديد (سهل وسريع)",
          value: "create_account",
          emoji: "1388102721374261258",
        },
        {
          label: "تعديل الحساب",
          description: "تعديل بيانات الحساب",
          value: "edit_account",
          emoji: "1388102721374261258",
        },
      ])
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("الدعم الفني")
      .setEmoji("1388102721374261258")
      .setStyle(ButtonStyle.Link)
      .setURL("https://discord.gg/XJ4YmQZ4FQ")
  );

  return { embeds: [embed], components: [row1, row2] };
}

// دالة للتحقق من صحة تنسيق الصورة
function isValidImageFormat(url) {
  if (!url || typeof url !== "string") return false;
  const supportedFormats = [".png", ".jpg", ".jpeg", ".gif", ".bmp"];
  const urlLower = url.toLowerCase();

  // التحقق من امتداد الملف
  const hasValidExtension = supportedFormats.some((format) =>
    urlLower.includes(format)
  );

  // التحقق من أن الرابط لا يحتوي على تنسيقات غير مدعومة
  const unsupportedFormats = [".webp", ".svg", ".ico", ".tiff", ".tga"];
  const hasUnsupportedExtension = unsupportedFormats.some((format) =>
    urlLower.includes(format)
  );

  return hasValidExtension && !hasUnsupportedExtension;
}

// دالة لتحويل رابط Discord إلى تنسيق مدعوم
function convertDiscordAvatarUrl(url) {
  if (url.includes("cdn.discordapp.com")) {
    // إزالة أي معاملات من الرابط وإضافة .png
    const baseUrl = url.split("?")[0];
    if (
      !baseUrl.endsWith(".png") &&
      !baseUrl.endsWith(".jpg") &&
      !baseUrl.endsWith(".jpeg") &&
      !baseUrl.endsWith(".gif")
    ) {
      return baseUrl + ".png";
    }
  }
  return url;
}

// دالة للتعامل الآمن مع التفاعلات
async function safeInteractionReply(interaction, content, options = {}) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content,
        flags: [MessageFlags.Ephemeral],
        ...options,
      });
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({
        content,
        ...options,
      });
    }
  } catch (error) {
    if (error.code === 10062) {
      console.log("التفاعل انتهت صلاحيته أو تم الرد عليه مسبقاً");
      return;
    }
    console.error("خطأ في الرد على التفاعل:", error);
  }
}

// دالة للتعامل الآمن مع عرض النماذج
async function safeShowModal(interaction, modal) {
  try {
    await interaction.showModal(modal);
  } catch (error) {
    if (error.code === 10062) {
      console.log("التفاعل انتهت صلاحيته أو تم الرد عليه مسبقاً");
      return;
    }
    console.error("خطأ في عرض النموذج:", error);
  }
}

// دالة للتعامل الآمن مع تحديث التفاعل
async function safeUpdateInteraction(interaction, content, options = {}) {
  try {
    await interaction.update({
      content,
      ...options,
    });
  } catch (error) {
    if (error.code === 10062) {
      console.log("التفاعل انتهت صلاحيته أو تم الرد عليه مسبقاً");
      return;
    }
    console.error("خطأ في تحديث التفاعل:", error);
  }
}
