import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("توثيق")
    .setDescription("إدارة توثيق المستخدمين")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("اختر العملية المطلوبة")
        .setRequired(true)
        .addChoices(
          { name: "إضافة توثيق", value: "add" },
          { name: "إزالة توثيق", value: "remove" }
        )
    ),

  async execute(interaction) {
    // التحقق من صحة التفاعل
    if (!interaction || !interaction.isChatInputCommand()) {
      console.error("تفاعل غير صالح في أمر توثيق");
      return;
    }

    // التحقق من صلاحيات المستخدم
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      try {
        return await interaction.reply({
          content: "يجب أن تملك صلاحية إدارة السيرفر لاستخدام هذا الأمر.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (error) {
        console.error("خطأ في الرد على تفاعل الصلاحيات:", error);
        return;
      }
    }

    const action = interaction.options.getString("action");
    const guildId = interaction.guild.id;

    try {
      // قراءة ملف servers.json
      const serversPath = path.join(__dirname, "../servers.json");
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

      if (action === "add") {
        // إنشاء منيو اختيار نوع التوثيق
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("verification_type")
          .setPlaceholder("اختر نوع التوثيق")
          .addOptions([
            {
              label: "توثيق حكومي",
              description: "توثيق رسمي حكومي",
              value: "government",
              emoji: "1388102721374261258",
            },
            {
              label: "توثيق مواطن",
              description: "توثيق للمواطنين",
              value: "citizen",
              emoji: "1388102721374261258",
            },
          ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
          .setTitle(" إضافة توثيق")
          .setDescription("اختر نوع التوثيق الذي تريد إضافته:")
          .setColor("#131B31")
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          components: [row],
          flags: [MessageFlags.Ephemeral],
        });
      } else if (action === "remove") {
        // تفعيل وضع إزالة التوثيق
        servers[guildId].removeVerificationMode = true;
        fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

        const embed = new EmbedBuilder()
          .setTitle(" إزالة توثيق")
          .setDescription("منشن الشخص الذي تريد إزالة التوثيق منه:")
          .setColor("#131B31")
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (error) {
      console.error("خطأ في أمر التوثيق:", error);
      try {
        await interaction.reply({
          content: "❌ حدث خطأ أثناء تنفيذ الأمر. يرجى المحاولة مرة أخرى.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        console.error("خطأ في الرد على التفاعل:", replyError);
      }
    }
  },
};
