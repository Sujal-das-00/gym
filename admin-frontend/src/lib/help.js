/* ---------------------------------------------------------------------------
 * Need Help view: Hindi + English video tutorials, and a bilingual text guide
 * that explains how/when to use every section and how to configure it.
 * Video IDs are in playlist order; edit the arrays to add/replace clips.
 *
 * Copied verbatim from the original admin-frontend/script.js (now in legacy/).
 * ------------------------------------------------------------------------- */
export const HELP_VIDEOS = {
  hi: [
    "kJXSpjgrGl8", "wOcj_oj4e5U", "RGDDi0VK1n4", "bCDzyT6r88c", "0LG7Cy5_WUU",
    "rUk_rUHzm1w", "431vcdrpdJM", "4MwMe1_gHfU", "SzuNqvxuCsY", "qL_luF56NxI",
  ],
  en: [
    "wAyRPe5MnWs", "JJUd74MImwk", "F5Yvjwk2y0k", "IbRn_dhzLu8", "PLPzr2_JF8E",
    "UhkA6SyKWQo", "srUNRxxDg70", "8ChNKDJLnYA", "ueazXm8nysE", "TepIMumzUD8",
  ],
};

export const HELP_VIDEO_LABEL = {
  hi: (i) => `हिंदी ट्यूटोरियल   भाग ${i}`,
  en: (i) => `English Tutorial   Part ${i}`,
};

export const HELP_GUIDE = [
  {
    icon: "dashboard",
    en: {
      title: "Dashboard",
      when: "Open this first every day for a one-glance picture of your gym.",
      how: [
        "The top cards show total members, overdue fees, members paid this month, who is present today, and active trainers.",
        "Activity Summary gives you this month's visits, attendance rate and active members.",
        "Use the Quick Actions buttons to jump straight into the daily tasks.",
      ],
      tip: "Nothing to set up here   it updates automatically as you add members and mark attendance.",
    },
    hi: {
      title: "डैशबोर्ड",
      when: "हर दिन सबसे पहले इसे खोलें   एक नज़र में पूरे जिम की स्थिति दिखती है।",
      how: [
        "ऊपर के कार्ड दिखाते हैं: कुल सदस्य, बकाया फीस, इस महीने भुगतान कर चुके सदस्य, आज कौन उपस्थित है, और सक्रिय ट्रेनर।",
        "Activity Summary इस महीने की विज़िट, उपस्थिति दर और सक्रिय सदस्य दिखाता है।",
        "Quick Actions बटनों से सीधे रोज़ के कामों में जाएँ।",
      ],
      tip: "यहाँ कुछ सेट करने की ज़रूरत नहीं   जैसे-जैसे आप सदस्य जोड़ते और उपस्थिति दर्ज करते हैं, यह अपने आप अपडेट होता है।",
    },
  },
  {
    icon: "person_add",
    en: {
      title: "Add Member",
      when: "Whenever a new person joins your gym.",
      how: [
        "Tap “Add member” (top-right or in the sidebar).",
        "Fill in name, phone, plan/fees and the join date.",
        "If your gym charges a one-time joining charge, enter it in “Admission fee”. Leave it blank (0) if you don't charge one.",
        "Choose whether they pay now (at join) or at the end of the period   this defaults to your Settings choice but you can change it for this member.",
        "Save. The member now appears in Members and on the Dashboard counts.",
      ],
      tip: "Enter the correct join date   the whole billing/renewal schedule is calculated from it.",
    },
    hi: {
      title: "सदस्य जोड़ें",
      when: "जब भी कोई नया व्यक्ति आपके जिम में शामिल हो।",
      how: [
        "“Add member” पर टैप करें (ऊपर-दाएँ या साइडबार में)।",
        "नाम, फ़ोन, प्लान/फीस और जॉइन तिथि भरें।",
        "अगर आपका जिम एक बार का एडमिशन शुल्क लेता है, तो उसे “Admission fee” में भरें। न लेते हों तो खाली (0) छोड़ दें।",
        "चुनें कि सदस्य अभी भुगतान करेगा (जॉइन पर) या अवधि के अंत में   यह आपकी Settings की सेटिंग से आता है, पर इस सदस्य के लिए बदला जा सकता है।",
        "सेव करें। अब सदस्य Members और डैशबोर्ड की गिनती में दिखेगा।",
      ],
      tip: "सही जॉइन तिथि डालें   पूरी बिलिंग/रिन्यूअल की गणना इसी से होती है।",
    },
  },
  {
    icon: "groups_3",
    en: {
      title: "Members",
      when: "To find, edit, renew or deactivate a member and view their history.",
      how: [
        "Search by name or phone number.",
        "Tap a member to open their details   fees paid/pending, plan, and attendance.",
        "From there you can collect a fee, edit the plan, or mark the member inactive.",
      ],
      tip: "Members with dues are highlighted so you can follow up quickly.",
    },
    hi: {
      title: "सदस्य",
      when: "किसी सदस्य को ढूँढने, बदलने, रिन्यू करने या निष्क्रिय करने और उसका इतिहास देखने के लिए।",
      how: [
        "नाम या फ़ोन नंबर से खोजें।",
        "किसी सदस्य पर टैप करें   भुगतान/बकाया, प्लान और उपस्थिति दिखती है।",
        "वहीं से फीस लें, प्लान बदलें, या सदस्य को निष्क्रिय करें।",
      ],
      tip: "बकाया वाले सदस्य हाइलाइट होते हैं ताकि आप जल्दी फॉलो-अप कर सकें।",
    },
  },
  {
    icon: "productivity",
    en: {
      title: "Mark Attendance",
      when: "When you record attendance yourself at the front desk.",
      how: [
        "Pick a date (defaults to today).",
        "Tap Present / Absent for each member.",
        "The count updates on the Dashboard instantly.",
      ],
      tip: "Days you mark as holidays in Settings are left out of each member's attendance rate.",
    },
    hi: {
      title: "उपस्थिति दर्ज करें",
      when: "जब आप खुद डेस्क पर उपस्थिति दर्ज करते हैं।",
      how: [
        "तिथि चुनें (डिफ़ॉल्ट आज की होती है)।",
        "हर सदस्य के लिए Present / Absent टैप करें।",
        "गिनती डैशबोर्ड पर तुरंत अपडेट हो जाती है।",
      ],
      tip: "Settings में जिन दिनों को छुट्टी बनाया है, वे उपस्थिति दर की गणना से हट जाते हैं।",
    },
  },
  {
    icon: "qr_code_scanner",
    en: {
      title: "QR Check-in",
      when: "When you want members to mark their own attendance by scanning a QR at the desk.",
      how: [
        "Open QR Check-in and show the screen (or print the QR) at your entrance.",
        "Members scan it with their phone and are marked present automatically.",
        "The live list shows who has just checked in.",
      ],
      tip: "The “Expired memberships” setting decides whether a lapsed member is allowed to check in here.",
    },
    hi: {
      title: "QR चेक-इन",
      when: "जब आप चाहें कि सदस्य डेस्क पर QR स्कैन करके खुद उपस्थिति लगाएँ।",
      how: [
        "QR Check-in खोलें और स्क्रीन दिखाएँ (या QR प्रिंट करके प्रवेश द्वार पर लगाएँ)।",
        "सदस्य अपने फ़ोन से स्कैन करते हैं और अपने-आप उपस्थित हो जाते हैं।",
        "लाइव सूची में दिखता है कि अभी-अभी किसने चेक-इन किया।",
      ],
      tip: "“Expired memberships” सेटिंग तय करती है कि समाप्त सदस्यता वाला सदस्य यहाँ चेक-इन कर सकता है या नहीं।",
    },
  },
  {
    icon: "calendar_month",
    en: {
      title: "Attendance History",
      when: "To review who came on any date or over a date range.",
      how: [
        "Choose a start and end date.",
        "Browse the records for that period.",
        "Visits flagged in red are members who checked in after their membership had expired (only if you allow that).",
      ],
      tip: "Use it to spot irregular members and follow up on renewals.",
    },
    hi: {
      title: "उपस्थिति इतिहास",
      when: "किसी भी तारीख या तारीख-सीमा में कौन आया, यह देखने के लिए।",
      how: [
        "शुरू और अंत की तिथि चुनें।",
        "उस अवधि के रिकॉर्ड देखें।",
        "लाल निशान वाली विज़िट वे सदस्य हैं जिन्होंने सदस्यता समाप्त होने के बाद चेक-इन किया (केवल तभी जब आपने इसकी अनुमति दी हो)।",
      ],
      tip: "अनियमित सदस्यों को पहचानने और रिन्यूअल के लिए फॉलो-अप में यह उपयोगी है।",
    },
  },
  {
    icon: "payments",
    en: {
      title: "Payments",
      when: "To review customer-wise payment records and outstanding dues.",
      how: [
        "Open Payments to see the payment history per customer.",
        "Open a customer to see which periods are paid and which are pending.",
        "Collect a pending fee directly from the member's detail screen.",
      ],
      tip: "If a member paid but still shows overdue, open their detail and confirm the correct period was collected.",
    },
    hi: {
      title: "भुगतान",
      when: "ग्राहक-वार भुगतान रिकॉर्ड और बकाया देखने के लिए।",
      how: [
        "Payments खोलें   हर ग्राहक का भुगतान इतिहास दिखता है।",
        "किसी ग्राहक को खोलें   कौन-सी अवधि भुगतान हो चुकी और कौन-सी बाकी है, यह दिखता है।",
        "बकाया फीस सीधे सदस्य के विवरण से लें।",
      ],
      tip: "अगर कोई सदस्य भुगतान कर चुका है पर फिर भी बकाया दिख रहा है, तो उसका विवरण खोलकर देखें कि सही अवधि की फीस ली गई है।",
    },
  },
  {
    icon: "account_balance_wallet",
    en: {
      title: "Expense Tracker",
      when: "To keep every expense and earning of the gym in one ledger.",
      how: [
        "Add an entry with amount, category and date.",
        "Use the date range to review totals for a period.",
        "Categories help you see where money is going. Collected fees appear as earnings   filter by “Admission fees” to see joining charges on their own.",
      ],
      tip: "Record cash-in and cash-out here to keep your gym's profit picture accurate.",
    },
    hi: {
      title: "खर्च ट्रैकर",
      when: "जिम के हर खर्च और कमाई को एक ही जगह रखने के लिए।",
      how: [
        "राशि, श्रेणी और तिथि के साथ एक एंट्री जोड़ें।",
        "किसी अवधि का कुल देखने के लिए तारीख-सीमा चुनें।",
        "श्रेणियों से पता चलता है कि पैसा कहाँ जा रहा है। वसूल की गई फीस कमाई में दिखती है   सिर्फ़ एडमिशन शुल्क देखने के लिए “Admission fees” फ़िल्टर चुनें।",
      ],
      tip: "आय और खर्च दोनों यहाँ दर्ज करें ताकि जिम का लाभ सही दिखे।",
    },
  },
  {
    icon: "insights",
    en: {
      title: "Detailed Insights",
      when: "To see the money for one month, a whole year, or any date range you choose.",
      how: [
        "Open <b>Billing → Detailed Insights</b>.",
        "Choose <b>Month</b> and pick the year and month (e.g. 2026 and August), or <b>Full year</b>, or <b>Custom dates</b> for your own range.",
        "The cards show what you earned, what you spent, and what you kept for that period.",
        "“Where the money came from” splits your income into membership fees and admission fees, and lists your top paying members. “Where the money went” splits your spending by category.",
        "Under “Day by day”, each day that saw money move is listed with its total. Tap <b>Read more</b> on a day to see every single entry — who paid, what for, and every expense.",
      ],
      tip: "Use Export CSV to save the whole period for your accountant.",
    },
    hi: {
      title: "विस्तृत जानकारी",
      when: "किसी एक महीने, पूरे साल, या अपनी चुनी हुई तारीखों का हिसाब देखने के लिए।",
      how: [
        "<b>Billing → Detailed Insights</b> खोलें।",
        "<b>Month</b> चुनकर साल और महीना चुनें (जैसे 2026 और August), या <b>Full year</b>, या अपनी तारीखों के लिए <b>Custom dates</b>।",
        "कार्ड दिखाते हैं कि उस अवधि में कितना कमाया, कितना खर्च हुआ, और कितना बचा।",
        "“Where the money came from” आपकी आय को मेंबरशिप फीस और एडमिशन फीस में बाँटता है और सबसे ज़्यादा भुगतान करने वाले सदस्य दिखाता है। “Where the money went” खर्च को श्रेणी के अनुसार बाँटता है।",
        "“Day by day” में हर उस दिन का कुल दिखता है जिस दिन पैसे का लेन-देन हुआ। किसी दिन पर <b>Read more</b> दबाकर उस दिन की हर एंट्री देखें — किसने भुगतान किया, किस लिए, और हर खर्च।",
      ],
      tip: "पूरी अवधि का हिसाब सेव करने के लिए Export CSV इस्तेमाल करें।",
    },
  },
  {
    icon: "exercise",
    en: {
      title: "Trainers",
      when: "To manage trainer profiles   specialties, shifts and contact details.",
      how: [
        "Add a trainer with name, specialty, shift and phone.",
        "Edit any trainer to update their details.",
        "Mark a trainer active or inactive; active trainers are counted on the Dashboard.",
      ],
      tip: "Keep trainer contacts here so any staff member can reach them.",
    },
    hi: {
      title: "ट्रेनर",
      when: "ट्रेनर की प्रोफ़ाइल   विशेषज्ञता, शिफ्ट और संपर्क   संभालने के लिए।",
      how: [
        "नाम, विशेषज्ञता, शिफ्ट और फ़ोन के साथ ट्रेनर जोड़ें।",
        "किसी ट्रेनर को एडिट करके विवरण अपडेट करें।",
        "ट्रेनर को सक्रिय/निष्क्रिय करें; सक्रिय ट्रेनर डैशबोर्ड पर गिने जाते हैं।",
      ],
      tip: "ट्रेनर के संपर्क यहाँ रखें ताकि कोई भी स्टाफ उन तक पहुँच सके।",
    },
  },
  {
    icon: "settings",
    en: {
      title: "Settings   set the app up for your gym",
      when: "Set this up once when you start, and revisit when your rules change.",
      how: [
        "<b>Gym name &amp; logo:</b> shown across the app and on the member check-in page   upload your logo for branding.",
        "<b>App colours:</b> match the app to your brand colours.",
        "<b>Billing cycle:</b> pick how you charge   1st of every month, a rolling 30-day membership, or a custom number of days (e.g. 25).",
        "<b>Payment collection:</b> “Collect at join (upfront)” marks the first term paid and sets the next due date; “Collect after the period” records the fee as due at the end of each period.",
        "<b>Expired memberships:</b> allow lapsed members to still check in (visits flagged red), or block check-in until they renew.",
        "<b>Gym holidays:</b> choose weekly closed days and add specific festival/event dates   these are excluded from every member's attendance rate.",
      ],
      tip: "Choose the billing cycle and collection timing that match how you already run your gym before adding members   it keeps every renewal date correct.",
    },
    hi: {
      title: "सेटिंग्स   ऐप को अपने जिम के अनुसार सेट करें",
      when: "शुरू में एक बार सेट करें, और जब आपके नियम बदलें तब दोबारा देखें।",
      how: [
        "<b>जिम का नाम और लोगो:</b> पूरे ऐप और सदस्य चेक-इन पेज पर दिखता है   ब्रांडिंग के लिए अपना लोगो अपलोड करें।",
        "<b>ऐप के रंग:</b> ऐप को अपने ब्रांड के रंगों से मिलाएँ।",
        "<b>बिलिंग साइकिल:</b> चुनें कि आप कैसे फीस लेते हैं   हर महीने की 1 तारीख, चलती हुई 30-दिन की सदस्यता, या अपने अनुसार दिन (जैसे 25)।",
        "<b>भुगतान संग्रह:</b> “Collect at join (upfront)” पहली अवधि को भुगतान मानकर अगली देय तिथि तय करता है; “Collect after the period” हर अवधि की फीस अंत में देय के रूप में दर्ज करता है।",
        "<b>समाप्त सदस्यता:</b> समाप्त सदस्यों को चेक-इन करने दें (विज़िट लाल दिखेगी), या रिन्यू करने तक चेक-इन रोक दें।",
        "<b>जिम की छुट्टियाँ:</b> साप्ताहिक बंद दिन चुनें और खास त्योहार/इवेंट की तिथियाँ जोड़ें   ये हर सदस्य की उपस्थिति दर से हट जाती हैं।",
      ],
      tip: "सदस्य जोड़ने से पहले वही बिलिंग साइकिल और संग्रह समय चुनें जो आप पहले से इस्तेमाल करते हैं   इससे हर रिन्यूअल तिथि सही रहती है।",
    },
  },
];

export const HELP_FAQ = {
  en: [
    {
      q: "My gym collects the fee at the time of joining (upfront)   what setting should I turn on?",
      a: "Go to <b>Settings → Payment collection</b> and choose <b>“Collect at join (upfront)”</b>. The member's first term is marked paid and the next payment is set to fall due one cycle later.",
    },
    {
      q: "My gym collects the fee after the period (e.g. after 30 days)   what setting should I turn on?",
      a: "Go to <b>Settings → Payment collection</b> and choose <b>“Collect after the period”</b>. Nothing is recorded at join; each period's fee falls due at the end of that period. (You can still override this for a single member while adding them.)",
    },
    {
      q: "My gym's billing cycle is 30 days   what setting should I turn on?",
      a: "Go to <b>Settings → Billing cycle</b> and choose <b>“30-day membership”</b>. Each member is billed every 30 days counted from their own start date.",
    },
    {
      q: "My gym bills from the 1st day of every month   what setting should I turn on?",
      a: "Go to <b>Settings → Billing cycle</b> and choose <b>“1st day of every month”</b>. Fees are due from the 1st, even for members who joined later in that month.",
    },
    {
      q: "My gym runs on a custom cycle (e.g. 25 days)   what setting should I turn on?",
      a: "Go to <b>Settings → Billing cycle</b>, choose <b>“Custom days”</b>, then enter your membership length in the “Custom membership days” box (for example 25).",
    },
    {
      q: "I allow members to check in even after their membership expires   what setting should I turn on?",
      a: "Go to <b>Settings → Expired memberships</b> and choose <b>“Allow check-in after expiry”</b>. Lapsed members can still check in and those visits are flagged red in the attendance history so you can follow up.",
    },
    {
      q: "I do NOT allow check-in after expiry   what setting should I turn on?",
      a: "Go to <b>Settings → Expired memberships</b> and choose <b>“Block check-in after expiry”</b>. The check-in page then shows “Membership expired   access denied” until the member renews, and no attendance is recorded.",
    },
    {
      q: "A member paid but still shows as overdue   why?",
      a: "Open the member's detail and check which period the payment was applied to. Collect the correct pending period from there and the overdue flag clears.",
    },
    {
      q: "How do I add my gym's logo and colours?",
      a: "Go to <b>Settings</b> → upload a logo and set the app colours. They appear across the app and on the member check-in page.",
    },
    {
      q: "Why is a member's attendance rate higher than the days they came?",
      a: "Holidays you set in <b>Settings → Gym holidays</b> are excluded from the count, so closed days don't lower anyone's rate.",
    },
    {
      q: "What's the difference between marking attendance and QR check-in?",
      a: "Mark Attendance is you tapping Present/Absent at the desk. QR Check-in lets members scan a QR and mark themselves present. You can use either or both.",
    },
  ],
  hi: [
    {
      q: "मेरा जिम फीस जॉइन के समय (पहले/एडवांस) लेता है   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Payment collection</b> में जाकर <b>“Collect at join (upfront)”</b> चुनें। सदस्य की पहली अवधि भुगतान मानी जाएगी और अगला भुगतान एक साइकिल बाद देय होगा।",
    },
    {
      q: "मेरा जिम फीस अवधि के बाद (जैसे 30 दिन बाद) लेता है   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Payment collection</b> में जाकर <b>“Collect after the period”</b> चुनें। जॉइन पर कुछ दर्ज नहीं होता; हर अवधि की फीस उस अवधि के अंत में देय होती है। (सदस्य जोड़ते समय इसे उस एक सदस्य के लिए बदला भी जा सकता है।)",
    },
    {
      q: "मेरे जिम का बिलिंग साइकिल 30 दिन का है   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Billing cycle</b> में जाकर <b>“30-day membership”</b> चुनें। हर सदस्य को उसकी अपनी शुरू तिथि से हर 30 दिन पर बिल किया जाता है।",
    },
    {
      q: "मेरा जिम हर महीने की 1 तारीख से बिल करता है   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Billing cycle</b> में जाकर <b>“1st day of every month”</b> चुनें। फीस हर महीने की 1 तारीख से देय होती है, भले सदस्य उस महीने बाद में जुड़ा हो।",
    },
    {
      q: "मेरा जिम कस्टम साइकिल पर चलता है (जैसे 25 दिन)   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Billing cycle</b> में जाकर <b>“Custom days”</b> चुनें, फिर “Custom membership days” बॉक्स में अपनी सदस्यता की अवधि डालें (जैसे 25)।",
    },
    {
      q: "मैं सदस्यता समाप्त होने के बाद भी चेक-इन की अनुमति देता हूँ   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Expired memberships</b> में जाकर <b>“Allow check-in after expiry”</b> चुनें। समाप्त सदस्य फिर भी चेक-इन कर सकते हैं और वे विज़िट उपस्थिति इतिहास में लाल दिखती हैं ताकि आप फॉलो-अप कर सकें।",
    },
    {
      q: "मैं समाप्ति के बाद चेक-इन की अनुमति नहीं देता   कौन-सी सेटिंग चालू करूँ?",
      a: "<b>Settings → Expired memberships</b> में जाकर <b>“Block check-in after expiry”</b> चुनें। तब चेक-इन पेज पर रिन्यू करने तक “Membership expired   access denied” दिखेगा और कोई उपस्थिति दर्ज नहीं होगी।",
    },
    {
      q: "सदस्य ने भुगतान कर दिया पर फिर भी बकाया दिख रहा है   क्यों?",
      a: "सदस्य का विवरण खोलें और देखें कि भुगतान किस अवधि पर लगा। वहीं से सही बकाया अवधि की फीस लें, बकाया का निशान हट जाएगा।",
    },
    {
      q: "अपने जिम का लोगो और रंग कैसे जोड़ूँ?",
      a: "<b>Settings</b> में लोगो अपलोड करें और ऐप के रंग सेट करें। ये पूरे ऐप और सदस्य चेक-इन पेज पर दिखेंगे।",
    },
    {
      q: "किसी सदस्य की उपस्थिति दर उसके आने के दिनों से ज़्यादा क्यों दिखती है?",
      a: "<b>Settings → Gym holidays</b> में सेट की गई छुट्टियाँ गिनती से हट जाती हैं, इसलिए बंद दिन किसी की दर कम नहीं करते।",
    },
    {
      q: "उपस्थिति दर्ज करने और QR चेक-इन में क्या फर्क है?",
      a: "Mark Attendance में आप डेस्क पर Present/Absent टैप करते हैं। QR Check-in में सदस्य QR स्कैन करके खुद उपस्थित होते हैं। आप कोई एक या दोनों इस्तेमाल कर सकते हैं।",
    },
  ],
};
