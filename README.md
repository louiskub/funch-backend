# Backend ของ Calrentar

NestJS API สำหรับแอปเช่ารถ Calrentar ใช้ PostgreSQL เก็บข้อมูลแอป และใช้ MinIO เก็บรูปภาพที่อัปโหลด

[Frontend repository และวิธีทดลองจอง](https://github.com/louiskub/funch-frontend#readme)

## สิ่งที่ต้องมี

- Node.js 24 ขึ้นไป
- npm
- Docker Compose

## เริ่มใช้งานในเครื่อง

รันคำสั่งจากโฟลเดอร์หลักของ Backend repository คำสั่ง `docker compose up` จะรอให้ PostgreSQL พร้อมก่อนเริ่มตั้งค่าฐานข้อมูล

```sh
npm ci
cp .env.example .env
docker compose up -d --wait postgres
npm run db:setup
npm run start:dev
```

API เปิดที่ `http://localhost:3001` หน้า Swagger อยู่ที่ `http://localhost:3001/docs` และ OpenAPI JSON อยู่ที่ `http://localhost:3001/docs/json`

เปิด [http://localhost:3001/api/health](http://localhost:3001/api/health) เพื่อตรวจว่า API พร้อมใช้งาน หากต้องการทดลองจองผ่านหน้าเว็บด้วยรายการจองและรูปรถตัวอย่าง ให้ทำต่อที่หัวข้อ [ข้อมูลตัวอย่าง](#ข้อมูลตัวอย่าง)

`db:setup` ใช้ TypeORM migrations ที่มีในโปรเจกต์ แล้วเพิ่มข้อมูลตั้งต้นที่ยังไม่มีลงในฐานข้อมูล คำสั่งนี้ไม่ได้สร้างฐานข้อมูลใหม่ การเชื่อมต่อ PostgreSQL ในเครื่องใช้ค่าเริ่มต้น `postgres://car-rental:car-rental@localhost:15432/car-rental`

## การตั้งค่า

คัดลอก `.env.example` เป็น `.env` ก่อนรัน API หรือสคริปต์ฐานข้อมูล Node.js จะโหลดค่าจากไฟล์นี้ หากตั้งค่าตัวแปรไว้ใน shell แล้ว ค่านั้นจะมีลำดับความสำคัญสูงกว่า

| ตัวแปร | ใช้สำหรับ | ค่าเริ่มต้น |
| --- | --- | --- |
| `PORT` | พอร์ตของ API | `3001` |
| `DATABASE_URL` | URL สำหรับเชื่อมต่อ PostgreSQL | ฐานข้อมูล `car-rental` ในเครื่อง พอร์ต `15432` |
| `DATABASE_SSL` | เปิดใช้ TLS สำหรับ PostgreSQL | `false` |
| `FRONTEND_ORIGIN` | origin ที่อนุญาตสำหรับ CORS พร้อม credentials | `http://localhost:3000` |
| `MINIO_ENDPOINT` | endpoint ของ MinIO ที่ API ใช้ | `http://localhost:19000` |
| `MINIO_PUBLIC_ENDPOINT` | endpoint ที่ browser ใช้เปิดรูปสาธารณะ | `http://localhost:19000` |
| `MINIO_BUCKET` | ชื่อ bucket สำหรับเก็บไฟล์ | `funch-assets` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | ข้อมูลเข้าสู่ระบบ MinIO ของแอป | ค่าสำหรับพัฒนาในเครื่อง |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | ข้อมูลเข้าสู่ระบบ MinIO สำหรับตัวเริ่มต้นระบบ | ค่าสำหรับพัฒนาในเครื่อง |

ตั้งรหัสผ่านเฉพาะและใช้ฐานข้อมูลส่วนตัวสำหรับสภาพแวดล้อมที่ใช้ร่วมกันหรือระบบที่ deploy แล้ว ตั้ง `DATABASE_SSL=true` เพื่อเปิด TLS ตามการตั้งค่าการเชื่อมต่อ PostgreSQL ปัจจุบัน

## ข้อมูลตัวอย่าง

คำสั่ง seed ปกติจะเพิ่มประเทศ สาขา รถ ข้อเสนอเช่ารถ options บัญชีตัวอย่างในเครื่อง และ bookings ที่ยังไม่มี โดยเก็บข้อมูลเดิมไว้และรันซ้ำได้:

```sh
npm run db:seed
```

หากต้องการทดลองจองและอนุมัติผ่านหน้าเว็บ ให้เปิด Terminal อีกหน้าต่างในโฟลเดอร์หลักของ Backend repository แล้วรันคำสั่งทีละบรรทัด รอให้ `minio-init` สร้าง bucket และตั้งค่าสิทธิ์เสร็จก่อนรัน `db:seed-demo`

```sh
docker compose up -d --wait minio
docker compose run --rm minio-init
npm run db:seed-demo
```

`db:seed-demo` ใช้ได้กับฐานข้อมูล `car-rental` บนเครื่องนี้เท่านั้น คำสั่งจะปฏิเสธ host หรือชื่อฐานข้อมูลอื่น โดยจะรีเซ็ต bookings, sessions และ options ของ demo ที่กำหนดไว้ อัปเดตบัญชี demo เหล่านั้น และแทนที่แกลเลอรีรูปรถ Camry กับ Model 3 ที่ seed ไว้ อย่ารันกับ production หรือฐานข้อมูลที่มีข้อมูลที่ต้องการเก็บไว้

บัญชี demo ใช้รหัสผ่าน `FunchDemo2026!`:

- ลูกค้า: `demo-customer@example.test`
- ลูกค้า: `demo-customer-2@example.test`
- แอดมิน: `demo-admin@example.test`
- ลูกค้าที่ถูกระงับ: `demo-suspended@example.test` (เข้าสู่ระบบไม่ได้)

ข้อมูลตัวอย่างครอบคลุมสถานะ booking ได้แก่ pending, approved, in-use, return-review, completed, cancelled และ rejected รวมถึง charges, options และแกลเลอรีรูปภาพ รูปตัวอย่างและลิงก์ที่มาของรูปอยู่ใน `assets/demo-cars/`

## ภาพรวม API

ทุก route ของ API ใช้ prefix `/api` รูปแบบ response คือ `{ "status": { "code": 200, "messages": "..." }, "data": ... }` ส่วน error จะมี `data: null`

| ส่วนงาน | Routes |
| --- | --- |
| Health check | `GET /api/health` |
| Catalog | `GET /api/countries`, `GET /api/countries/:countryCode/branches`, `GET /api/branches/:branchId/offers`, `GET /api/offers/:offerId` |
| การยืนยันตัวตนและโปรไฟล์ | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me` |
| Bookings | Routes สำหรับคำนวณราคา checkout ประวัติ booking ของลูกค้า และจัดการวงจร booking โดยแอดมิน |
| Fleet, options, files และ reports | ดู routes สำหรับแอดมินทั้งหมดได้ใน Swagger |

เปิดหน้า Swagger UI ที่ `http://localhost:3001/docs` เพื่อดู schema ของ request, parameters และ routes ทั้งหมด

## ภาพรวมการทำงานของระบบ

เส้นทางหลักของ request เป็นดังนี้:

```text
Browser → NestJS Controller → Guard และ DTO validation → Service → PostgreSQL
                                                           ↘ Core business rules
FilesService → StorageService → MinIO
```

Controller กำหนด HTTP routes และตรวจสิทธิ์ ส่วน service ประสานงานกับฐานข้อมูลและระบบอื่น กฎคำนวณที่ไม่ต้องพึ่ง NestJS หรือฐานข้อมูลอยู่ใน `src/core/` เช่น การคิดราคา การตรวจช่วงเวลาว่าง และการคำนวณเวลาที่รถพร้อมให้เช่าครั้งถัดไป

การจองทำงานตามลำดับนี้:

1. `POST /api/bookings/quote` คำนวณราคาและตรวจจำนวนรถกับ options ที่ว่างในช่วงเวลาที่เลือก
2. `POST /api/bookings` สร้าง booking สำหรับลูกค้าที่เข้าสู่ระบบ ส่วน `POST /api/bookings/register-checkout` รองรับการสมัครบัญชีและจองในคำขอเดียว
3. API คำนวณราคาและตรวจ availability ซ้ำภายใน transaction ก่อนบันทึก booking สถานะเริ่มต้นเป็น `PENDING`
4. แอดมินอนุมัติคำขอได้เมื่อรถและ options ยังมีจำนวนเพียงพอ ระบบเลือกตัวรถจริงในขั้นตอนรับรถ
5. ตอนรับรถ ระบบเปลี่ยนสถานะเป็น `IN_USE` หลังตรวจว่ารถอยู่ในสาขาและประเภทรถที่ถูกต้อง ใช้งานได้ ไม่ได้ถูกเช่าอยู่ และพ้นช่วงพักรถแล้ว
6. ตอนคืนรถ ระบบบันทึกเวลาคืนจริง คำนวณค่าเช่าหรือ options ที่เกินเวลา และเพิ่ม charge อื่น เช่น ค่าเสียหาย ให้แอดมินตรวจ
7. ระบบเปลี่ยน booking เป็น `COMPLETED` หลังบันทึกการคืนรถและจัดการ charge ที่ยังรอพิจารณาทั้งหมดแล้ว

Checkout ในโปรเจกต์เป็น mock flow ไม่มีการเชื่อมต่อ payment gateway หรือหักเงินจริง ระบบบันทึก `paidAmount` ตามยอด booking เพื่อใช้ทดสอบ workflow เท่านั้น

## การตัดสินใจในการออกแบบ

- **แยกการคำนวณจาก framework:** ฟังก์ชันใน `src/core/` รับข้อมูลและคืนผลลัพธ์โดยตรง จึงใช้กฎเดียวกันจากหลายขั้นตอนและทดสอบได้โดยไม่ต้องเปิด API หรือฐานข้อมูล
- **เสนอราคาก่อน แต่คำนวณซ้ำตอนยืนยัน:** quote ใช้แสดงราคาให้ลูกค้า ส่วน checkout คำนวณใหม่และตรวจราคา/availability อีกครั้ง ป้องกันการใช้ quote เก่าหลังราคาหรือจำนวนรถเปลี่ยน
- **ป้องกัน checkout ซ้ำ:** แต่ละ checkout มี `checkoutKey` ที่ไม่ซ้ำกัน การส่ง key เดิมซ้ำจะคืน booking เดิม แทนการสร้างรายการใหม่
- **เก็บ snapshot ของราคา:** booking เก็บ rate, currency และราคาของ options ณ เวลาจอง การแก้ราคาใน offer ภายหลังจึงไม่เปลี่ยนยอดของ booking เก่า
- **คิด availability จากช่วงเวลาที่ทับซ้อน:** ระบบหาจำนวนรถหรือ options ที่ถูกจองพร้อมกันสูงสุดในช่วงที่ขอ แทนการนับรายการจองทั้งหมด รถยังถูกกันไว้จนถึงเวลาพร้อมใช้งานครั้งถัดไป
- **บันทึกการแก้ booking เป็น revision:** การแก้วันหรือ options จะคำนวณยอดใหม่ ตรวจ revision และ quote ที่ลูกค้ายืนยันก่อนบันทึก พร้อมเก็บสถานะก่อนและหลังการแก้

## หลักการคิดราคา

การคำนวณหลักอยู่ใน [`src/core/pricing.core.ts`](src/core/pricing.core.ts) และใช้ค่าเงินของ offer ที่สาขานั้นกำหนด ราคาทุกส่วนใน booking ต้องใช้ currency เดียวกัน

### ค่าเช่ารถ

ระบบคิดจากเวลาที่ผ่านไปจริง ไม่ได้นับตามวันปฏิทิน:

1. นับทุก 24 ชั่วโมงเต็มเป็นหนึ่งวัน
2. ปัดเศษเวลาที่เหลือขึ้นเป็นชั่วโมง
3. ถ้าเวลาที่เหลือมากกว่า 8 ชั่วโมง หรือเวลาคืนตามเขตเวลาสาขาเลย 14:00 น. ให้คิดเศษนั้นเป็นอีกหนึ่งวัน
4. ถ้ายังคิดเป็นชั่วโมง แต่ค่าเช่ารายชั่วโมงรวมสูงกว่ารายวัน ให้เปลี่ยนชั่วโมงส่วนนั้นเป็นหนึ่งวัน
5. รวม `จำนวนวัน × daily rate` กับ `จำนวนชั่วโมง × hourly rate`

ตัวอย่าง: daily rate 1,000 บาท และ hourly rate 150 บาท หากเช่า 26 ชั่วโมงและเวลาคืนในสาขาเป็น 12:00 น. ระบบคิด 1 วันกับ 2 ชั่วโมง รวม 1,300 บาท หากเวลาคืนเป็น 15:00 น. เศษเวลาจะถูกคิดเป็นอีกหนึ่งวัน รวม 2,000 บาท

### Options

ราคาของแต่ละ option ใช้วิธีตาม `pricingType`:

| ประเภท | วิธีคิด |
| --- | --- |
| `FIXED` | ราคา × 1 ต่อ booking |
| `PER_DAY` | ราคา × จำนวนวันที่ปัดขึ้นจากชั่วโมงเช่าจริง |
| `PER_UNIT_PER_DAY` | ราคา × จำนวนวัน × จำนวนที่เลือก |

จำนวนวันของ options ใช้ `ceil(ระยะเวลาเป็นชั่วโมง ÷ 24)` ซึ่งแยกจากกติกาปัดเศษค่าเช่ารถ

### ยอดรวมและค่าใช้จ่ายหลังจอง

`totalAmount` เท่ากับค่าเช่ารถรวมกับ options ไม่มีภาษีหรือค่าธรรมเนียมอื่นในสูตรนี้ จำนวนเงินใช้ decimal arithmetic แทน floating point และระบบไม่ปัดตามจำนวนหลักย่อยของ currency metadata

เมื่อคืนรถช้ากว่าเวลาที่จอง ระบบคำนวณค่าเช่าใหม่ถึงเวลาคืนจริง แล้วเพิ่มเฉพาะส่วนต่างที่สูงกว่ายอดค่าเช่าที่จองไว้ Options แบบรายวันจะคิดเพิ่มตามจำนวนวันที่เกิน ส่วน option แบบ `FIXED` จะไม่ถูกคิดซ้ำ ค่าใช้จ่ายส่วนนี้ถูกบันทึกเป็น charge เพิ่มเติม ส่วน fuel, damage และ other charges จะรอแอดมินยืนยันหรือยกเว้นก่อนปิด booking

การคำนวณราคาและยอดแก้ booking ดูได้ที่ [`src/core/pricing.core.ts`](src/core/pricing.core.ts) และ [`src/core/booking-edit.core.ts`](src/core/booking-edit.core.ts) กฎเวลาพร้อมใช้งานและจำนวนรถว่างอยู่ใน [`src/core/policy.core.ts`](src/core/policy.core.ts)

## การเก็บไฟล์

Compose เปิด MinIO ที่พอร์ต `19000` สำหรับ S3 API และพอร์ต `19001` สำหรับ console บริการ `minio-init` สร้าง bucket, บัญชีแอปที่มีสิทธิ์จำกัด และ policy ที่อนุญาตให้อ่านไฟล์สาธารณะใน path `public/`

ตั้ง `MINIO_ENDPOINT` เป็น address ที่ backend เข้าถึงได้ และตั้ง `MINIO_PUBLIC_ENDPOINT` เป็น address ที่ browser เข้าถึงได้ API ส่ง URL ของรูปสาธารณะกลับมาพร้อมรายละเอียดข้อเสนอเช่ารถ การอัปโหลดไฟล์และดาวน์โหลดไฟล์ส่วนตัวต้องใช้ session ของแอดมินที่ยังใช้งานได้

ลบ object ที่ไม่มีข้อมูลในฐานข้อมูลอ้างถึงและมีอายุอย่างน้อย 24 ชั่วโมงได้ด้วยคำสั่งนี้:

```sh
npm run files:cleanup-orphans
```

## คำสั่งสำหรับพัฒนา

```sh
npm run start:dev       # เริ่ม API และเฝ้าดูการเปลี่ยนแปลงไฟล์
npm run build           # คอมไพล์ API
npm run lint            # รัน ESLint
npm test -- --runInBand # รัน unit tests
npm run test:cov        # รัน unit tests พร้อม coverage
```

คำสั่งเกี่ยวกับฐานข้อมูล:

```sh
npm run db:migrate      # ใช้ migrations ที่ยังไม่ถูกรัน
npm run db:seed         # เพิ่มข้อมูลตั้งต้นที่ยังไม่มี
npm run db:setup        # ใช้ migrations แล้ว seed ข้อมูล
npm run db:seed-demo    # รีเซ็ตข้อมูล demo ที่กำหนดไว้ในเครื่อง
```

สร้างบัญชีแอดมินโดยกำหนด `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` และ `ADMIN_PHONE` ใน environment ก่อนรัน `npm run admin:provision`

## โครงสร้างโปรเจกต์

```text
src/
  common/       HTTP filters, interceptors และ middleware
  core/         กฎธุรกิจที่ใช้ร่วมกัน และ helper สำหรับ decimal/time แบบแม่นยำ
  modules/      Catalog, authentication, bookings, fleet, files และ options
  platform/     Configuration, database, health checks และ storage adapters
scripts/        คำสั่งจัดการฐานข้อมูล บัญชีแอดมิน และไฟล์ที่ไม่มีข้อมูลอ้างถึง
```

แต่ละ feature module มี controller และ service ของตัวเอง ไฟล์ประกอบ เช่น DTOs, entities, guards และ enums อยู่ในโฟลเดอร์ย่อยของ module นั้น
