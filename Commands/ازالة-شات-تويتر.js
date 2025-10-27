import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("ازالة-شات-تويتر")
    .setDescription("إزالة روم التغريدات من السيرفر"),
  async execute(interaction) {
    // التحقق من صحة التفاعل
    if (!interaction || !interaction.isChatInputCommand()) {
      console.error("تفاعل غير صالح في أمر ازالة-شات-تويتر");
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

    const guildId = interaction.guild.id;

    try {
      // قراءة ملف servers.json
      const serversPath = path.join(__dirname, "../servers.json");
      if (!fs.existsSync(serversPath)) {
        try {
          return await interaction.reply({
            content: "❌ لم يتم تعيين روم التغريدات لهذا السيرفر.",
            flags: [MessageFlags.Ephemeral],
          });
        } catch (error) {
          console.error("خطأ في الرد على عدم وجود روم:", error);
          return;
        }
      }

      const servers = JSON.parse(fs.readFileSync(serversPath, "utf8"));

      if (!servers[guildId] || !servers[guildId].twitterChannelId) {
        try {
          return await interaction.reply({
            content: "❌ لم يتم تعيين روم التغريدات لهذا السيرفر.",
            flags: [MessageFlags.Ephemeral],
          });
        } catch (error) {
          console.error("خطأ في الرد على عدم وجود روم:", error);
          return;
        }
      }

      // حذف روم التغريدات
      delete servers[guildId].twitterChannelId;
      fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));

      try {
        await interaction.reply({
          content: "✅ تم إزالة روم التغريدات بنجاح!",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        console.error("خطأ في الرد الناجح:", replyError);
      }
    } catch (error) {
      console.error("خطأ في إزالة روم التغريدات:", error);

      // التحقق من أن التفاعل لا يزال صالحاً قبل الرد
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content:
              "❌ حدث خطأ أثناء إزالة روم التغريدات. يرجى المحاولة مرة أخرى.",
            flags: [MessageFlags.Ephemeral],
          });
        } catch (replyError) {
          console.error("خطأ في الرد على التفاعل:", replyError);
        }
      } else if (interaction.deferred && !interaction.replied) {
        try {
          await interaction.editReply({
            content:
              "❌ حدث خطأ أثناء إزالة روم التغريدات. يرجى المحاولة مرة أخرى.",
          });
        } catch (editError) {
          console.error("خطأ في تعديل الرد:", editError);
        }
      }
    }
  },
};
