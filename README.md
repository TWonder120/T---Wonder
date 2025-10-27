# Wonder Twitter Bot 🐦

بوت ديسكورد لمحاكاة منصة تويتر مع إمكانية نشر التغريدات والتفاعل معها.

## ✨ المميزات

- 🐦 نشر التغريدات مع صور مخصصة
- 👤 إدارة حسابات المستخدمين
- ❤️ نظام الإعجاب وإعادة التغريد
- 🔐 نظام التوثيق للمستخدمين
- 🎨 تخصيص إحداثيات التغريدات
- 📊 إحصائيات مفصلة
- 🗄️ قاعدة بيانات PostgreSQL

## 🚀 الإعداد السريع

### 1. إعداد قاعدة البيانات

1. اذهب إلى [Neon Console](https://console.neon.tech/)
2. أنشئ مشروع جديد
3. احصل على رابط الاتصال (Connection String)

### 2. إعداد متغيرات البيئة

انسخ ملف `env.example` إلى `.env` واملأ القيم:

```bash
cp env.example .env
```

```env
# إعدادات قاعدة البيانات
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require

# إعدادات البوت
BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here

# إعدادات المطورين
OWNER_GUILD_ID=your_owner_guild_id_here
DEVELOPER_ID=your_developer_id_here
```

### 3. تثبيت التبعيات

```bash
npm install
```

### 4. إعداد قاعدة البيانات

```bash
npm run setup-db
```

### 5. تشغيل البوت

```bash
npm start
```

## 🌐 النشر على Render

### 1. رفع المشروع على GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/wonder-twitter-bot.git
git push -u origin main
```

### 2. إعداد Render

1. اذهب إلى [Render Dashboard](https://dashboard.render.com/)
2. اضغط "New +" ثم "Web Service"
3. اربط حساب GitHub واختر المشروع
4. املأ الإعدادات:

**Build Command:**
```bash
npm install
```

**Start Command:**
```bash
npm start
```

**Environment Variables:**
```
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
OWNER_GUILD_ID=your_owner_guild_id_here
DEVELOPER_ID=your_developer_id_here
```

## 📋 الأوامر المتاحة

### أوامر المستخدمين
- `/إنشاء-حساب` - إنشاء حساب تويتر جديد
- `/تحديث-اسم` - تحديث اسم المستخدم
- `/تحديث-يوزر` - تحديث اليوزر
- `/تحديث-صورة` - تحديث صورة الحساب
- `/تغريدة` - نشر تغريدة جديدة

### أوامر المطورين
- `-سيرفرات` - عرض جميع السيرفرات
- `-say` - إرسال رسالة باسم البوت
- `-ضبط-احداثيات` - ضبط إحداثيات التغريدات
- `-اعادة-احداثيات` - إعادة تعيين الإحداثيات
- `-اختبار-احداثيات` - اختبار الإحداثيات

## 🗄️ قاعدة البيانات

البوت يستخدم PostgreSQL مع الجداول التالية:

- `accounts` - حسابات المستخدمين
- `tweets` - التغريدات
- `likes` - الإعجابات
- `retweets` - إعادة التغريد
- `replies` - الردود

## 🔧 التطوير

### هيكل المشروع

```
├── index.js                 # الملف الرئيسي
├── database.js              # إعدادات قاعدة البيانات
├── dbAccountManager.js      # إدارة الحسابات
├── setupDatabase.js         # سكريبت إعداد قاعدة البيانات
├── Commands/                # أوامر السلاش
├── fonts/                   # خطوط مخصصة
└── DATABASE_SETUP.md       # دليل إعداد قاعدة البيانات
```

### إضافة ميزات جديدة

1. أضف الجداول المطلوبة في `database.js`
2. أضف الدوال في `dbAccountManager.js`
3. أضف الأوامر في مجلد `Commands/`

## 📝 ملاحظات مهمة

- ⚠️ لا تشارك ملف `.env` أو `config.json` مع أي شخص
- 🔒 احفظ التوكنات بأمان
- 📊 راقب استخدام قاعدة البيانات
- 🔄 قم بعمل نسخ احتياطية دورية

## 🤝 المساهمة

1. Fork المشروع
2. أنشئ فرع للميزة الجديدة
3. اعمل Commit للتغييرات
4. ادفع الفرع
5. افتح Pull Request

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT.

## 🆘 الدعم

إذا واجهت أي مشاكل:

1. تحقق من متغيرات البيئة
2. تأكد من إعداد قاعدة البيانات
3. راجع ملفات السجل للأخطاء
4. افتح Issue في GitHub

---

**تم التطوير بـ ❤️ بواسطة فريق Wonder**
