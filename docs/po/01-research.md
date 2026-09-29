# Stage 1 · Explore & Research

ตรวจสอบเมื่อ 29 ก.ย. 2569 · อ้างอิง SPEC.md ฉบับร่าง 29 ก.ย. 2569 · แหล่งข้อมูลหลักคือเอกสารทางการ (developers.line.biz, lineforbusiness.com, ราชกิจจานุเบกษา, bot.or.th, docs.bullmq.io, nextjs.org)

สถานะในตาราง: **ยืนยันแล้ว** = ตรงกับแหล่งข้อมูลหลัก · **ต่างจากที่คาด** = แหล่งข้อมูลระบุต่างจาก SPEC หรือมีเงื่อนไขที่ SPEC ไม่ได้ระบุ · **ยังไม่ยืนยัน** = ไม่พบแหล่งข้อมูลทางการที่ระบุชัด

## 1. ข้อเท็จจริงที่ตรวจสอบแล้ว

| # | ข้อกล่าวอ้าง | ผลการตรวจสอบ | แหล่งที่มา | สถานะ |
| --- | --- | --- | --- | --- |
| 1 | ตรวจ `X-Line-Signature` ด้วย HMAC-SHA256 ของ body โดยใช้ channel secret แล้ว encode เป็น Base64 | ถูกต้อง และเอกสารกำชับว่าต้องใช้ body ดิบแบบ UTF-8 ห้าม parse หรือจัดรูปแบบ JSON ก่อนตรวจ | [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) | ยืนยันแล้ว |
| 2a | `webhookEventId` เป็น key สำหรับกันการประมวลผลซ้ำ | เป็น ULID ที่ระบุ event ไม่ซ้ำกัน เอกสารแนะนำให้ใช้ตรวจ event ซ้ำ และระบุว่า event เดียวกันอาจถูกส่งมาซ้ำด้วยสาเหตุอื่น เช่น network routing ไม่ใช่เฉพาะกรณี redelivery | [Messaging API reference · Webhook event objects](https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects) · [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/#redeliver-webhooks) | ยืนยันแล้ว |
| 2b | LINE ส่ง event ซ้ำ (redelivery) | **ปิดไว้เป็นค่าเริ่มต้น** ต้องเปิด "Webhook redelivery" ใน LINE Developers Console แท็บ Messaging API · ส่งซ้ำเมื่อ bot server ไม่ตอบ `2xx` · event ที่ส่งซ้ำมี `deliveryContext.isRedelivery = true` ส่วน `webhookEventId` และ reply token คงเดิม · จำนวนครั้งและช่วงเวลาไม่เปิดเผย ไม่รับประกันการส่ง และลำดับ event อาจสลับ (ให้ดู `timestamp`) | [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/#redeliver-webhooks) | ต่างจากที่คาด |
| 3a | Reply token ใช้ได้นานเท่าใด และใช้ได้ครั้งเดียว | ใช้ได้ครั้งเดียว · ต้องใช้ภายใน 1 นาทีหลังได้รับ webhook (เกินนั้นไม่รับประกัน) · token ใน event ที่ส่งซ้ำใช้ได้ภายใน 1 นาทีหลังรับ แต่ใช้ไม่ได้หาก token เดิมถูกใช้ไปแล้ว หรือเกิน 20 นาทีนับจากเกิด event · LINE อาจเปลี่ยนระยะเวลานี้โดยไม่แจ้งล่วงหน้า | [Send reply message · Reply token](https://developers.line.biz/en/reference/messaging-api/#send-reply-message-reply-token) | ยืนยันแล้ว |
| 3b | Reply ไม่นับโควตา ส่วน Push นับ | Push, Multicast, Broadcast, Narrowcast นับโควตา · Reply ไม่นับ · **นับตามจำนวนผู้รับ** ไม่ใช่จำนวน message object เช่น Push 4 object เข้าห้องที่มี 5 คน นับเป็น 5 ข้อความ · ไม่นับผู้ที่บล็อก OA | [Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/) | ยืนยันแล้ว (มีเงื่อนไขเพิ่ม ดูข้อ D1) |
| 4 | Reply/Push ส่งได้สูงสุด 5 ข้อความต่อครั้ง | สูงสุด 5 message object ต่อ request | [Send messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/) | ยืนยันแล้ว |
| 5 | Quick Reply สูงสุด 13 ปุ่ม และชนิด action ที่ใช้ได้ | สูงสุด 13 ปุ่ม · ใช้ได้: postback, message, URI, datetime picker, clipboard และ camera, camera roll, location (ใช้ได้เฉพาะ Quick Reply) · ใช้ rich menu switch ไม่ได้ | [Use quick replies](https://developers.line.biz/en/docs/messaging-api/using-quick-reply/) · [Quick reply items](https://developers.line.biz/en/reference/messaging-api/#items-object) | ยืนยันแล้ว |
| 6 | Flex: carousel ไม่เกิน 12 bubble · bubble 30 KB · carousel 50 KB · ต้องมี altText | ถูกต้องทุกข้อ · altText เป็นฟิลด์บังคับ ยาวได้ไม่เกิน 1,500 ตัวอักษร | [Flex Message · Bubble / Carousel](https://developers.line.biz/en/reference/messaging-api/#f-carousel) | ยืนยันแล้ว |
| 7 | Datetime picker: mode และรูปแบบค่าที่ได้ | mode = `date` / `time` / `datetime` · ค่าใน `postback.params`: `date` = `full-date` (เช่น 2026-09-29), `time` = `HH:mm`, `datetime` = `full-date"T"HH:mm` ตาม RFC 3339 · **ไม่รองรับ time zone** · `data` ยาวได้ไม่เกิน 300 ตัวอักษร | [Datetime picker action](https://developers.line.biz/en/reference/messaging-api/#datetime-picker-action) · [postback.params](https://developers.line.biz/en/reference/messaging-api/#postback-params-object) | ยืนยันแล้ว |
| 8 | ดึงรูปจาก `GET https://api-data.line.me/v2/bot/message/{messageId}/content` และเนื้อหาอยู่ได้นานเท่าใด | endpoint ถูกต้อง · ใช้ได้เฉพาะเมื่อ `contentProvider.type = line` (ถ้าเป็น `external` ต้องดึงจาก URL ที่ให้มา) · เนื้อหาถูกลบอัตโนมัติ "หลังช่วงเวลาหนึ่ง" **ไม่มีการรับประกันระยะเวลา** · error ที่อาจได้คือ 404 / 410 | [Get content](https://developers.line.biz/en/reference/messaging-api/#get-content) | ยืนยันแล้ว (ระยะเวลาเก็บ: ไม่เปิดเผย) |
| 9 | LINE Notify ยุติบริการ | ยุติเมื่อ 31 มี.ค. 2568 (2025) ประกาศเมื่อ 7 ต.ค. 2567 และแนะนำให้ใช้ Messaging API แทน | [LINE Notify terminated](https://developers.line.biz/en/news/2025/04/01/line-notify/) · [ประกาศล่วงหน้า](https://developers.line.biz/en/news/2024/10/07/line-notify-will-be-discontinued/) | ยืนยันแล้ว |
| 10 | แพ็กเกจ LINE OA ประเทศไทย | ฟรี: 0 บาท 300 ข้อความ/เดือน ส่งเพิ่มไม่ได้ · เบสิก: 1,280 บาท/เดือน 15,000 ข้อความ ส่วนเกิน 0.1 บาท/ข้อความ · โปร: 1,780 บาท/เดือน 35,000 ข้อความ ส่วนเกิน 0.06 บาท/ข้อความ · ราคายังไม่รวม VAT 7% (ข้อมูลหน้าเว็บ ณ วันที่ตรวจ) | [LINE for Business TH · แพ็กเกจข้อความ](https://lineforbusiness.com/th/service/line-oa-features/broadcast-message) (หน้าที่ developers.line.biz อ้างถึงสำหรับไทย) | ยืนยันแล้ว |
| 11a | LIFF: `liff.init()`, `liff.getProfile()`, `liff.getIDToken()` | มีครบใน LIFF SDK · ต้องขอ scope `openid` จึงใช้ `getIDToken()` ได้ | [LIFF API reference](https://developers.line.biz/en/reference/liff/) | ยืนยันแล้ว |
| 11b | Server ยืนยันตัวผู้ใช้ด้วยการตรวจ ID token | ส่ง ID token จาก `liff.getIDToken()` ไปที่ server แล้วตรวจด้วย `POST https://api.line.me/oauth2/v2.1/verify` (`id_token`, `client_id` = LINE Login channel ID) ใช้ค่า `sub` เป็น userId · **ห้ามส่งข้อมูลจาก `liff.getProfile()` หรือ `getDecodedIDToken()` ไปที่ server โดยตรง** · ทางเลือกคือส่ง access token แล้วตรวจด้วย `GET /oauth2/v2.1/verify` | [Using user data in LIFF apps and servers](https://developers.line.biz/en/docs/liff/using-user-profile/) · [Verify ID token](https://developers.line.biz/en/reference/line-login/#verify-id-token) | ยืนยันแล้ว |
| 11c | LIFF กับ Messaging API ได้ userId เดียวกัน | LIFF ต้องอยู่บน LINE Login channel (เพิ่มใน Messaging API channel ไม่ได้แล้ว) · userId แยกตาม **provider** จะตรงกันก็ต่อเมื่อทั้งสอง channel อยู่ใต้ provider เดียวกัน | [LIFF getting started](https://developers.line.biz/en/docs/liff/getting-started/) · [Get user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/) | ยืนยันแล้ว |
| 12 | Webhook ต้องตอบ 200 เร็ว | เอกสารแนะนำให้ประมวลผลแบบ async · สถิติ error ระบุ `request_timeout` เมื่อ bot server ไม่ตอบภายใน **2 วินาที** · เป้าหมาย 1 วินาทีใน SPEC จึงอยู่ในเกณฑ์ | [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) · [Check webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/) | ยืนยันแล้ว |
| 13a | PDPA มาตรา 19: ความยินยอม | ต้องได้รับความยินยอมก่อนหรือขณะเก็บ · ทำโดยชัดแจ้ง เป็นหนังสือหรือผ่านระบบอิเล็กทรอนิกส์ · แจ้งวัตถุประสงค์ · แยกส่วนจากข้อความอื่นอย่างชัดเจน ใช้ภาษาอ่านง่าย · **ห้ามตั้งเงื่อนไขให้ยินยอมเกินจำเป็นเพื่อรับบริการ** (วรรคสี่) · ถอนความยินยอมได้ทุกเมื่อ และต้อง **ถอนได้ง่ายเท่ากับการให้ความยินยอม** | [พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (ราชกิจจานุเบกษา เล่ม 136 ตอน 69 ก)](https://ratchakitcha.soc.go.th/documents/17082307.pdf) | ยืนยันแล้ว |
| 13b | PDPA มาตรา 30–36: สิทธิของเจ้าของข้อมูล | ม.30 เข้าถึงและขอสำเนา (ดำเนินการภายใน 30 วัน) · ม.31 ขอรับ/โอนข้อมูลในรูปแบบที่อ่านด้วยเครื่องได้ · ม.32 คัดค้าน · ม.33 ลบ ทำลาย หรือทำให้ไม่ระบุตัวตน · ม.34 ระงับการใช้ · ม.35–36 แก้ไขให้ถูกต้อง · เพิ่มเติม: ม.24 ฐานทางกฎหมายอื่นนอกจากความยินยอม (เช่น (3) ปฏิบัติตามสัญญาหรือคำขอของเจ้าของข้อมูล) และ ม.37(4) แจ้งเหตุละเมิดต่อสำนักงานภายใน 72 ชั่วโมง | แหล่งเดียวกับ 13a | ยืนยันแล้ว |
| 14 | แหล่งข้อมูลวันหยุดแบบ machine-readable | ธปท. มี "Financial Institutions' Holidays API" แต่เป็น **วันหยุดสถาบันการเงิน** ไม่ใช่วันหยุดราชการทั้งหมด · portal เดิม (apiportal.bot.or.th) ย้ายไป portal.api.bot.or.th และ domain เดิมไม่ตอบสนองแล้ว ณ วันที่ตรวจ · รายละเอียด endpoint/การยืนยันตัวตนของ portal ใหม่ ยังไม่ยืนยัน · วันหยุดราชการประกาศโดยมติคณะรัฐมนตรีผ่านเว็บไซต์ สลค. ในรูปแบบเอกสาร ไม่พบ API ทางการ | [BOT · Financial Institutions Holiday](https://www.bot.or.th/en/financial-institutions-holiday.html) · [BOT API portal](https://portal.api.bot.or.th/) · [สลค. วันหยุดราชการ 2569](https://www.soc.go.th/?p=33672) | ต่างจากที่คาด / API ใหม่ ยังไม่ยืนยัน |
| 15 | BullMQ ใช้ custom `jobId` กันงานซ้ำ | job ที่ใช้ `jobId` ซ้ำจะถูกข้าม **แต่เมื่อ job ถูกลบแล้ว (เช่น `removeOnComplete`) จะเพิ่ม jobId เดิมได้อีก** · jobId ห้ามมี `:` และห้ามเป็นตัวเลขล้วน · delayed job ปรับเวลาได้ด้วย `changeDelay()` และไม่รับประกันเวลาเป๊ะ | [BullMQ · Job IDs](https://docs.bullmq.io/guide/jobs/job-ids) · [Delayed jobs](https://docs.bullmq.io/guide/jobs/delayed) | ยืนยันแล้ว |
| 16 | Next.js Route Handler อ่าน body ดิบได้ (กรณีวาง webhook ใน Next.js) | ใช้ `await request.text()` ได้โดยไม่ต้องตั้ง bodyParser | [Next.js · route.js](https://nextjs.org/docs/app/api-reference/file-conventions/route) | ยืนยันแล้ว |

## 2. จุดที่ต่างจาก SPEC.md

- **D1 · ค่าใช้จ่ายการแจ้งเตือนเข้า LINE กลุ่มทีม (SPEC §8)** Push เข้ากลุ่มนับตามจำนวนสมาชิกในกลุ่ม กลุ่มทีม 10 คน = 10 ข้อความต่อการแจ้งเตือน 1 ครั้ง SPEC ระบุเพียงว่า Push นับโควตา ควรคำนวณปริมาณใหม่ หรือย้ายการแจ้งเตือนภายในไปที่ web notification/email เป็นหลัก
- **D2 · Redelivery ไม่ได้เปิดเอง (SPEC §7)** ต้องเปิดใน Console และแม้เปิดแล้วก็ไม่รับประกันการส่ง ส่วน event ซ้ำเกิดได้แม้ไม่เปิด redelivery การกันซ้ำจึงจำเป็นเสมอ
- **D3 · กันซ้ำด้วย BullMQ jobId อย่างเดียวไม่พอ** jobId ใช้ซ้ำได้หลัง job ถูกลบ ควรมี unique constraint ของ `webhookEventId` ในฐานข้อมูล (หรือ Redis key ที่มี TTL ยาวพอ) ก่อนประมวลผล
- **D4 · Reply token กับการประมวลผลผ่าน queue (SPEC §7, §8)** SPEC ให้ตอบ 200 ทันทีแล้วประมวลผลใน queue และให้ "สร้างเคสสำเร็จ" ตอบด้วย Reply ต้องออกแบบให้ worker ส่ง reply ได้ภายใน 1 นาที และส่งเลขเคสกับเวลา SLA ในการเรียกครั้งเดียว (สูงสุด 5 ข้อความ) หากพลาดต้อง fallback เป็น Push ซึ่งนับโควตา
- **D5 · ไฟล์แนบไม่มีระยะเวลาเก็บที่รับประกัน (SPEC §3, §6)** ต้องดาวน์โหลดเข้า object storage ทันทีที่รับ event และรองรับกรณี `contentProvider.type = external` กับ error 404/410
- **D6 · Flex carousel จำกัด 12 bubble (SPEC §3)** ทั้ง "ตัวเลือกจำนวนมาก" และ "เคสของฉัน" ต้องมีการแบ่งหน้า (bubble สุดท้ายเป็น "ดูเพิ่มเติม") หรือย้ายไป LIFF และต้องคุมขนาด JSON ไม่เกิน 50 KB
- **D7 · Datetime picker ไม่มี time zone** ต้องตีความค่าเป็น Asia/Bangkok อย่างชัดเจนเมื่อบันทึก และ `postback.data` ยาวได้ไม่เกิน 300 ตัวอักษร (ไม่ควรฝัง state ของบทสนทนาไว้ใน data)
- **D8 · การยืนยันตัวตนผ่าน LIFF (SPEC §3 ลงทะเบียน)** SPEC ไม่ได้ระบุวิธี ต้องใช้ ID token + `/oauth2/v2.1/verify` และสร้าง LINE Login channel ใต้ provider เดียวกับ Messaging API channel มิฉะนั้น userId จะไม่ตรงกัน กรณี multi-tenant ที่แต่ละลูกค้ามี provider ของตนเอง ต้องเก็บ channel credential และ LIFF ID แยกต่อ tenant
- **D9 · PDPA (SPEC §3, §8)**
  - SPEC ขอความยินยอมตอนเพิ่มเพื่อนสำหรับทุกการประมวลผล แต่การรับเรื่องและดำเนินการตามคำขอของผู้แจ้งอาจใช้ฐาน ม.24(3) ได้ และ ม.19 วรรคสี่ห้ามบังคับให้ยินยอมเกินจำเป็นเพื่อรับบริการ ควรแยกความยินยอมรายวัตถุประสงค์ (เช่น แบบสอบถามความพึงพอใจหรือการตลาด) จากข้อมูลที่จำเป็นต่อการให้บริการ (ต้องให้ผู้เชี่ยวชาญกฎหมายยืนยัน)
  - SPEC ไม่มีช่องทาง **ถอนความยินยอม** ซึ่งต้องทำได้ง่ายเท่ากับการให้ความยินยอม (เช่น เมนูใน LIFF หรือ rich menu)
  - SPEC ครอบคลุมเพียงขอสำเนา แก้ไข และลบ ยังขาดสิทธิ์ตาม ม.31 (โอนข้อมูล), ม.32 (คัดค้าน), ม.34 (ระงับการใช้) และการจับเวลา 30 วันตาม ม.30
  - SPEC ไม่มีขั้นตอนแจ้งเหตุละเมิดข้อมูลภายใน 72 ชั่วโมงตาม ม.37(4) และการบันทึกเหตุผลเมื่อปฏิเสธคำขอตาม ม.39
- **D10 · ปฏิทินวันหยุดสำหรับ SLA (SPEC §4, §5)** ไม่มีแหล่งวันหยุดราชการแบบ API ทางการที่ยืนยันได้ API ของ ธปท. ครอบคลุมเฉพาะวันหยุดสถาบันการเงิน ควรให้ Admin จัดการปฏิทินวันหยุดเอง และถ้าต้องการ ให้นำเข้าค่าเริ่มต้นจาก ธปท. หรือประกาศ ครม. ต่อปี
- **D11 · แพ็กเกจ LINE OA (SPEC §9 ประเด็นที่ต้องตัดสินใจ)** ตัวเลขปัจจุบันอยู่ในข้อ 10 แพ็กเกจฟรี (300 ข้อความ) ส่งเกินไม่ได้ เมื่อหมดโควตา API จะตอบ 429 และข้อความไม่ถูกส่ง ระบบต้องจัดการกรณีนี้

## 3. ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | แนวทางลด |
| --- | --- | --- |
| โควตา Push หมดกลางเดือน (429) | ผู้แจ้งไม่ได้รับอัปเดตสถานะหรือคำตอบจาก agent | เรียก Get quota/consumption เป็นระยะ · แจ้งเตือน Admin ที่ 80% · มีช่องทางสำรอง (SMS/email) สำหรับข้อความสำคัญ · รวมข้อความที่ไม่เร่งด่วน |
| Webhook ช้ากว่า 2 วินาทีหรือ server ล่ม | event หาย (หากไม่เปิด redelivery) หรือได้ event ซ้ำและสลับลำดับ | ตอบ 200 หลังตรวจลายเซ็นและบันทึก event ลง queue/DB เท่านั้น · เปิด redelivery · กันซ้ำด้วย `webhookEventId` · เรียงด้วย `timestamp` ต่อ userId |
| Reply token หมดอายุระหว่างประมวลผล | ต้อง fallback เป็น Push ทำให้เสียโควตาโดยไม่ตั้งใจ | วัด latency ของ worker · ตั้ง timeout ภายในต่ำกว่า 1 นาที · นับจำนวน fallback เป็น metric |
| ไฟล์แนบถูกลบจาก LINE ก่อนดาวน์โหลด | เคสขาดหลักฐาน | ดาวน์โหลดทันทีด้วย job ที่มี retry · แจ้งผู้แจ้งให้ส่งใหม่เมื่อได้ 404/410 |
| userId ไม่ตรงกันระหว่าง LIFF และ bot | ผูก contact ผิดหรือซ้ำ | กำหนดในขั้นตั้งค่า tenant ว่าทั้งสอง channel ต้องอยู่ provider เดียวกัน และตรวจ `sub` เทียบกับ userId จาก webhook |
| การปลอมตัวตนใน LIFF form | ข้อมูลผู้แจ้งถูกแก้โดยผู้อื่น | รับเฉพาะ ID token และตรวจที่ server เท่านั้น |
| Channel มี webhook URL ได้ชุดเดียว (ตั้งผ่าน `PUT /v2/bot/channel/webhook/endpoint`) | หากลูกค้าใช้เครื่องมือแชทอื่น (เช่น Oho Chat, Zendesk) กับ OA เดียวกันอยู่แล้ว จะชนกัน | ตรวจสอบระหว่าง onboarding ลูกค้า และวางแผนย้ายหรือแยก OA |
| LINE เปลี่ยนเงื่อนไข (reply token, redelivery, ราคา) โดยไม่แจ้งล่วงหน้า | พฤติกรรมระบบเปลี่ยน | ไม่ hard-code ค่าเวลา · ติดตาม LINE Developers News · เก็บค่าที่ปรับได้ไว้ใน config |
| ตีความฐานทางกฎหมาย PDPA ผิด | ความยินยอมที่ไม่เป็นไปตาม ม.19 ไม่มีผลผูกพัน | ให้ DPO หรือที่ปรึกษากฎหมายตรวจข้อความประกาศและฐานการประมวลผลก่อนเปิดใช้งาน |

## 4. แนวคิดที่ควรพิจารณา

**จาก LINE Platform (ยืนยันจากเอกสารแล้ว)**

- **Loading animation** ระหว่าง bot เตรียมคำตอบ ([Display a loading animation](https://developers.line.biz/en/docs/messaging-api/use-loading-indicator/)) ช่วยให้ผู้ใช้รู้ว่าระบบกำลังทำงานเมื่อผ่าน queue
- **Mark as read** ด้วย `markAsReadToken` เมื่อ agent เปิดดูข้อความ ทำให้ผู้แจ้งเห็นว่าอ่านแล้ว (ต้องเปิด Chat ใน LINE OA Manager และ token ไม่มีวันหมดอายุ) ([Mark messages as read](https://developers.line.biz/en/docs/messaging-api/mark-as-read/))
- **Quick Reply แบบ camera / cameraRoll / location** แทนการพิมพ์คำแนะนำ ช่วยให้ขั้นแนบรูปและระบุตำแหน่งสะดวกขึ้น
- **Quote token** ใน message event ใช้อ้างถึงข้อความเดิมของผู้แจ้งเมื่อตอบกลับ ช่วยลดความสับสนเมื่อมีหลายเคส (ต้องตรวจรายละเอียดเพิ่มในขั้น Design)

**จากผลิตภัณฑ์ที่คล้ายกัน (ภาพรวมโดยย่อ)**

| ผลิตภัณฑ์ | สิ่งที่ทำ (จากเอกสารของผู้ให้บริการ) | สิ่งที่ SPEC ยังไม่มี |
| --- | --- | --- |
| Zendesk (LINE social messaging) | เชื่อม LINE ด้วย Channel ID/secret และ webhook URL · ข้อความจาก LINE กลายเป็น ticket ใน Agent Workspace · ตั้งข้อความตอบกลับอัตโนมัติ · รองรับหลาย brand · ต้องมี Suite หรือ add-on | การรองรับหลาย OA/brand ต่อ tenant · ขั้นตอนเชื่อม channel แบบ self-service พร้อมตรวจสอบ webhook |
| Oho Chat (ไทย) | รวมแชท LINE OA, Facebook, Instagram · ฟีเจอร์ Case: สถานะ (ดูแลอยู่ · ปิด · dismiss · spam) · วัด "เวลารอ" และ "เวลาให้บริการ" · tag หลายรายการต่อเคส · บันทึกภายใน · ลิงก์แชร์เคส · dashboard | สถานะ **spam/dismiss** แยกจาก cancelled · **tag** อิสระนอกเหนือจากหมวดหมู่ · ลิงก์แชร์เคสภายในทีม · มุมมองเวลารอแบบ real-time |
| Zwiz.ai (ไทย) | chatbot ภาษาไทยหลายแพลตฟอร์ม (LINE, Facebook, IG, TikTok, WhatsApp) · เครื่องมือสร้าง rich menu · ไม่พบเอกสารฟีเจอร์ ticket (ยังไม่ยืนยัน) | ตัวแก้ไข rich menu แบบภาพ (SPEC มีเพียง "ออกแบบและสลับ") · การตอบอัตโนมัติด้วย AI ซึ่ง SPEC วางไว้ใน Phase 3 |

ข้อสังเกต: คู่แข่งส่วนใหญ่เป็นระบบรวมแชทที่ต่อยอดเป็นเคส ส่วน SPEC เป็นแบบฟอร์มเชิงโครงสร้างตั้งแต่ต้นพร้อม SLA และ Flow Builder ซึ่งเป็นจุดต่าง ควรคงจุดนี้ไว้ แต่เพิ่มการรองรับข้อความอิสระนอกแบบฟอร์ม (ผู้ใช้พิมพ์เรื่องมาเลยโดยไม่กดเมนู) ให้ชัดเจนตั้งแต่ MVP

## 5. แหล่งที่มา

- LINE Developers · Verify webhook signature — https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- LINE Developers · Receive messages (webhook, redelivery) — https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- LINE Developers · Messaging API reference (reply token, get content, Flex, quick reply, datetime picker, webhook endpoint) — https://developers.line.biz/en/reference/messaging-api/
- LINE Developers · Send messages — https://developers.line.biz/en/docs/messaging-api/sending-messages/
- LINE Developers · Messaging API pricing — https://developers.line.biz/en/docs/messaging-api/pricing/
- LINE Developers · Use quick replies — https://developers.line.biz/en/docs/messaging-api/using-quick-reply/
- LINE Developers · Check webhook error statistics — https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/
- LINE Developers · Mark messages as read — https://developers.line.biz/en/docs/messaging-api/mark-as-read/
- LINE Developers · Get user IDs — https://developers.line.biz/en/docs/messaging-api/getting-user-ids/
- LINE Developers · LIFF API reference — https://developers.line.biz/en/reference/liff/
- LINE Developers · Using user data in LIFF apps and servers — https://developers.line.biz/en/docs/liff/using-user-profile/
- LINE Developers · LIFF getting started — https://developers.line.biz/en/docs/liff/getting-started/
- LINE Developers · LINE Login reference (Verify ID token) — https://developers.line.biz/en/reference/line-login/#verify-id-token
- LINE Developers News · LINE Notify terminated — https://developers.line.biz/en/news/2025/04/01/line-notify/
- LINE for Business Thailand · แพ็กเกจข้อความ — https://lineforbusiness.com/th/service/line-oa-features/broadcast-message
- ราชกิจจานุเบกษา · พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 — https://ratchakitcha.soc.go.th/documents/17082307.pdf
- ธนาคารแห่งประเทศไทย · วันหยุดสถาบันการเงิน — https://www.bot.or.th/en/financial-institutions-holiday.html · BOT API portal — https://portal.api.bot.or.th/
- สำนักเลขาธิการคณะรัฐมนตรี · วันหยุดราชการ ปี 2569 — https://www.soc.go.th/?p=33672
- BullMQ · Job IDs — https://docs.bullmq.io/guide/jobs/job-ids · Delayed jobs — https://docs.bullmq.io/guide/jobs/delayed
- Next.js · route.js (Webhooks) — https://nextjs.org/docs/app/api-reference/file-conventions/route
- Zendesk · Adding LINE social messaging channels — https://support.zendesk.com/hc/en-us/articles/4408844138394
- Oho Chat · ฟีเจอร์เคส — https://help.oho.chat/user-manual/case
- Zwiz.ai — https://zwiz.ai/en
