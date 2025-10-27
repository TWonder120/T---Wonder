import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("تعيين-شات-تويتر")
    .setDescription("تعيين روم التغريدات للسيرفر")
    .addChannelOption((option) =>
      option
        .setName("الروم")
        .setDescription("اختر روم التغريدات")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),
  async execute(interaction) {
    // التحقق من صحة التفاعل
    if (!interaction || !interaction.isChatInputCommand()) {
      console.error("تفاعل غير صالح في أمر تعيين-شات-تويتر");
      return;
    }

    // التحقق من صلاحيات المستخدم
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await interaction.reply({
          content: "يجب أن تملك صلاحية إدارة السيرفر لاستخدام هذا الأمر.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (permissionError) {
      console.error("خطأ في التحقق من الصلاحيات:", permissionError);
      return await interaction.reply({
        content: "❌ حدث خطأ في التحقق من الصلاحيات. يرجى المحاولة مرة أخرى.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const channel = interaction.options.getChannel("الروم");
    const guildId = interaction.guild.id;

    try {
      // قراءة ملف servers.json
      const serversPath = path.join(__dirname, "../servers.json");
      let servers = {};
      if (fs.existsSync(serversPath)) {
        servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));
      }

      // حفظ اسم السيرفر
      if (!servers[guildId]) servers[guildId] = {};
      servers[guildId].guildName = interaction.guild.name;
      servers[guildId].twitterChannelId = channel.id;

      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

      try {
        await interaction.reply({
          content: `✅ تم تعيين روم التغريدات بنجاح!\n📺 الروم: ${channel}\n🏠 السيرفر: ${interaction.guild.name}`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        console.error("خطأ في الرد الناجح:", replyError);
      }
    } catch (error) {
      console.error("خطأ في تعيين روم التغريدات:", error);

      // التحقق من أن التفاعل لا يزال صالحاً قبل الرد
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content:
              "❌ حدث خطأ أثناء تعيين روم التغريدات. يرجى المحاولة مرة أخرى.",
            flags: [MessageFlags.Ephemeral],
          });
        } catch (replyError) {
          console.error("خطأ في الرد على التفاعل:", replyError);
        }
      } else if (interaction.deferred && !interaction.replied) {
        try {
          await interaction.editReply({
            content:
              "❌ حدث خطأ أثناء تعيين روم التغريدات. يرجى المحاولة مرة أخرى.",
          });
        } catch (editError) {
          console.error("خطأ في تعديل الرد:", editError);
        }
      }
    }
  },
};
