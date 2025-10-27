import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { joinVoiceChannel } from "@discordjs/voice";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("تعيين-روم-الصوت")
    .setDescription("تعيين روم الصوت للسيرفر")
    .addChannelOption((option) =>
      option
        .setName("الروم")
        .setDescription("اختر روم الصوت")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    ),
  async execute(interaction) {
    // التحقق من صحة التفاعل
    if (!interaction || !interaction.isChatInputCommand()) {
      console.error("تفاعل غير صالح في أمر تعيين-روم-الصوت");
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
      servers[guildId].voiceChannelId = channel.id;

      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

      try {
        await interaction.reply({
          content: `✅ تم تعيين روم الصوت بنجاح!\n🔊 الروم: ${channel}\n🏠 السيرفر: ${interaction.guild.name}`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        console.error("خطأ في الرد الناجح:", replyError);
      }
    } catch (error) {
      console.error("خطأ في تعيين روم الصوت:", error);

      // التحقق من أن التفاعل لا يزال صالحاً قبل الرد
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content:
              "❌ حدث خطأ أثناء تعيين روم الصوت. يرجى المحاولة مرة أخرى.",
            flags: [MessageFlags.Ephemeral],
          });
        } catch (replyError) {
          console.error("خطأ في الرد على التفاعل:", replyError);
        }
      } else if (interaction.deferred && !interaction.replied) {
        try {
          await interaction.editReply({
            content:
              "❌ حدث خطأ أثناء تعيين روم الصوت. يرجى المحاولة مرة أخرى.",
          });
        } catch (editError) {
          console.error("خطأ في تعديل الرد:", editError);
        }
      }
    }
  },
};
