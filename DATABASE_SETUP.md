# دليل إعداد قاعدة البيانات PostgreSQL مع Neon

## الخطوات المطلوبة:

### 1. إعداد قاعدة البيانات في Neon
1. اذهب إلى: https://console.neon.tech/app/org-icy-tooth-83437074/projects?modal=create_project
2. أنشئ مشروع جديد أو استخدم المشروع الموجود
3. احصل على رابط الاتصال (Connection String) من لوحة التحكم
4. الرابط سيبدو هكذا: `postgresql://username:password@host:port/database?sslmode=require`

### 2. إعداد متغيرات البيئة
أنشئ ملف `.env` في مجلد المشروع وأضف:
```
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
DISCORD_TOKEN=your_discord_token_here
CLIENT_ID=your_client_id_here
```

### 3. تشغيل إعداد قاعدة البيانات
```bash
npm run setup-db
```

هذا الأمر سيقوم بـ:
- اختبار الاتصال بقاعدة البيانات
- إنشاء الجداول المطلوبة
- نقل البيانات الموجودة من `accounts.json` إلى قاعدة البيانات

### 4. تحديث البوت لاستخدام قاعدة البيانات
في ملف `index.js`، غيّر:
```javascript
// من:
import {
  createAccount,
  getAccount,
  // ... باقي الدوال
} from "./accountManager.js";

// إلى:
import {
  createAccount,
  getAccount,
  // ... باقي الدوال
} from "./dbAccountManager.js";
```

### 5. اختبار البوت
```bash
npm start
```

## الملفات الجديدة المضافة:
- `database.js` - إعدادات الاتصال بقاعدة البيانات
- `dbAccountManager.js` - مدير الحسابات الجديد باستخدام PostgreSQL
- `setupDatabase.js` - سكريبت إعداد قاعدة البيانات
- `dbConfig.js` - ملف إعدادات قاعدة البيانات

## المزايا الجديدة:
- ✅ تخزين آمن وموثوق للبيانات
- ✅ دعم للاستعلامات المعقدة
- ✅ إمكانية النسخ الاحتياطي التلقائي
- ✅ أداء أفضل مع البيانات الكبيرة
- ✅ دعم للعلاقات بين الجداول
- ✅ إحصائيات مفصلة للتغريدات والإعجابات

## ملاحظات مهمة:
- تأكد من حفظ رابط الاتصال بأمان
- لا تشارك ملف `.env` مع أي شخص
- يمكنك حذف ملف `accounts.json` بعد التأكد من عمل قاعدة البيانات
- في حالة وجود مشاكل، يمكنك الرجوع إلى النسخة الاحتياطية من `accounts.json`
