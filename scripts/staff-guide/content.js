// Staff guide text. One entry per sheet; each has en + ar.
// Button/screen names stay in English in both languages (the app is English-only).
// step: [text, optionalImage]   img: file name in docs/staff-guide/img
module.exports = {
  ui: {
    en: { tips: 'Good to know', steps: 'Steps', footer: 'SchoolQ Staff Guide', page: 'Page' },
    ar: { tips: 'ملاحظات مفيدة', steps: 'الخطوات', footer: 'دليل موظفي SchoolQ', page: 'صفحة' },
  },
  sheets: [
    {
      id: '01-signing-in',
      en: {
        title: 'Signing in',
        intro: 'Everyone uses SchoolQ with their own user name and password. Your administrator gives them to you.',
        steps: [
          ['Open the SchoolQ app on your computer.', 'login.png'],
          ['Type your **User name** and your **Password**.'],
          ['Click **Sign in**. The Home screen opens.'],
          ['If this is your first sign-in with the starting password, a **Choose a new password** screen opens. Type a new password of 8 or more characters. You cannot skip this step.'],
          ['When you finish work, click **Logout** at the top right.'],
        ],
        tips: [
          'A department user opens straight to the **Queue Dashboard** for that department.',
          'You only see the screens your administrator gave you.',
          'If you forget your password, ask your administrator.',
        ],
      },
      ar: {
        title: 'تسجيل الدخول',
        intro: 'يستخدم كل موظف SchoolQ باسم المستخدم وكلمة المرور الخاصة به. يعطيهما لك المسؤول.',
        steps: [
          ['افتح تطبيق SchoolQ على جهازك.', 'login.png'],
          ['اكتب **User name** ثم **Password**.'],
          ['اضغط **Sign in**. ستفتح الشاشة الرئيسية.'],
          ['إذا كان هذا أول دخول لك بكلمة المرور الأولية، ستظهر شاشة **Choose a new password**. اكتب كلمة مرور جديدة من 8 أحرف أو أكثر. لا يمكن تخطي هذه الخطوة.'],
          ['عند انتهاء العمل اضغط **Logout** في أعلى اليمين.'],
        ],
        tips: [
          'مستخدم القسم تفتح له مباشرة شاشة **Queue Dashboard** الخاصة بقسمه.',
          'ترى فقط الشاشات التي منحك إياها المسؤول.',
          'إذا نسيت كلمة المرور، اطلب المساعدة من المسؤول.',
        ],
      },
    },
    {
      id: '02-home',
      en: {
        title: 'The Home screen',
        intro: 'Home shows one card for each screen you can use. Click a card to open it.',
        steps: [
          ['Find the card you need, for example **Reception** or **Reports**.', 'home.png'],
          ['Click the card. To come back, click **← Home** at the top left.'],
          ['To change your password, click **🔑 Password**.', 'home-password.png'],
          ['Type your current password and your new password. The new password must have 8 or more characters. Save.'],
        ],
        tips: [
          'Cards you cannot see are not given to your user. Ask your administrator if you need one.',
          'Change your password if you think someone else knows it.',
        ],
      },
      ar: {
        title: 'الشاشة الرئيسية',
        intro: 'تعرض الشاشة الرئيسية بطاقة لكل شاشة يمكنك استخدامها. اضغط على البطاقة لفتحها.',
        steps: [
          ['ابحث عن البطاقة التي تحتاجها، مثل **Reception** أو **Reports**.', 'home.png'],
          ['اضغط على البطاقة. للرجوع اضغط **← Home** في أعلى اليسار.'],
          ['لتغيير كلمة المرور اضغط **🔑 Password**.', 'home-password.png'],
          ['اكتب كلمة المرور الحالية ثم الجديدة. يجب أن تكون الجديدة 8 أحرف أو أكثر. ثم احفظ.'],
        ],
        tips: [
          'البطاقات غير الظاهرة غير مفعّلة لمستخدمك. اطلبها من المسؤول إن احتجتها.',
          'غيّر كلمة المرور إذا ظننت أن شخصاً آخر يعرفها.',
        ],
      },
    },
    {
      id: '03-reception',
      en: {
        title: 'Reception: make a ticket',
        intro: 'Use Reception when a parent comes to the desk and you make the ticket for them.',
        steps: [
          ['Open **Reception** from Home.', 'reception-form.png'],
          ['Choose the **Department** and the **Service Type**.'],
          ['Read the **Estimated wait** and the **Queue position** on the screen.'],
          ['Type the **Parent Name** and the **Student Name**. Both are required. **Student ID**, **Phone Number** and **Purpose of Visit** are optional.'],
          ['Choose the **Priority**: **Regular** (the default), **Urgent**, **Elderly** or **Vip**.'],
          ['Click **CREATE & PRINT TICKET**. The ticket opens. Click **PRINT** and give it to the parent. Click **CREATE ANOTHER TICKET** for the next parent.', 'reception-ticket.png'],
        ],
        tips: [
          'The ticket number ends in **U** (urgent), **P** (elderly) or **V** (VIP). A normal ticket has no letter.',
          'Order of calling: urgent, then elderly, then VIP, then normal. Inside each group the oldest ticket is first.',
        ],
      },
      ar: {
        title: 'الاستقبال: إنشاء تذكرة',
        intro: 'استخدم Reception عندما يحضر ولي الأمر إلى المكتب وتنشئ له التذكرة بنفسك.',
        steps: [
          ['افتح **Reception** من الشاشة الرئيسية.', 'reception-form.png'],
          ['اختر **Department** و **Service Type**.'],
          ['اقرأ **Estimated wait** و **Queue position** على الشاشة.'],
          ['اكتب **Parent Name** و **Student Name**. الاسمان مطلوبان. أما **Student ID** و **Phone Number** و **Purpose of Visit** فاختيارية.'],
          ['اختر **Priority**: **Regular** (الافتراضي) أو **Urgent** أو **Elderly** أو **Vip**.'],
          ['اضغط **CREATE & PRINT TICKET**. ستظهر التذكرة. اضغط **PRINT** وسلّمها لولي الأمر. اضغط **CREATE ANOTHER TICKET** لولي الأمر التالي.', 'reception-ticket.png'],
        ],
        tips: [
          'ينتهي رقم التذكرة بحرف **U** (عاجل) أو **P** (كبار السن) أو **V** (VIP). التذكرة العادية بلا حرف.',
          'ترتيب النداء: عاجل، ثم كبار السن، ثم VIP، ثم العادي. وداخل كل مجموعة الأقدم أولاً.',
        ],
      },
    },
    {
      id: '04-queue-dashboard',
      en: {
        title: 'Queue Dashboard: serve parents',
        intro: 'Staff who work in one department use this screen all day to call and serve parents.',
        steps: [
          ['Open **Queue Dashboard**. At the top you see **Waiting**, **Serving Now** and **Served Today**.', 'queue.png'],
          ['Click **CALL NEXT PARENT**. The next ticket is called on the display screen.'],
          ['The green box shows the parent, student, service and purpose.'],
          ['Write notes in **Service Notes** if needed.'],
          ['When you finish, click **COMPLETE**. The notes are saved.'],
          ['Use **RECALL** to call the same ticket again if the parent did not come.'],
          ['Use **SKIP**, **TRANSFER**, **NO-SHOW** or **CANCEL / LEFT** when needed. **TRANSFER** and **CANCEL / LEFT** ask for a reason. See the Queue Control sheet.'],
        ],
        tips: [
          'You can only call the next parent after you complete or close the current one.',
          'The table **Waiting Queue** shows everyone who waits, in calling order.',
          '**Cancel** in the table removes a waiting ticket.',
        ],
      },
      ar: {
        title: 'لوحة الطابور: خدمة أولياء الأمور',
        intro: 'يستخدم موظفو القسم هذه الشاشة طوال اليوم لنداء أولياء الأمور وخدمتهم.',
        steps: [
          ['افتح **Queue Dashboard**. في الأعلى ترى **Waiting** و **Serving Now** و **Served Today**.', 'queue.png'],
          ['اضغط **CALL NEXT PARENT**. سيُنادى على التذكرة التالية في شاشة العرض.'],
          ['يعرض المربع الأخضر ولي الأمر والطالب والخدمة والغرض.'],
          ['اكتب ملاحظاتك في **Service Notes** عند الحاجة.'],
          ['عند الانتهاء اضغط **COMPLETE**. تُحفظ الملاحظات.'],
          ['استخدم **RECALL** لنداء نفس التذكرة مرة أخرى إذا لم يحضر ولي الأمر.'],
          ['استخدم **SKIP** أو **TRANSFER** أو **NO-SHOW** أو **CANCEL / LEFT** عند الحاجة. **TRANSFER** و **CANCEL / LEFT** يطلبان كتابة السبب. راجع ورقة Queue Control.'],
        ],
        tips: [
          'لا يمكنك نداء ولي أمر جديد قبل إنهاء أو إغلاق الحالي.',
          'جدول **Waiting Queue** يعرض كل المنتظرين بترتيب النداء.',
          'زر **Cancel** في الجدول يحذف تذكرة منتظرة.',
        ],
      },
    },
    {
      id: '05-all-queues',
      en: {
        title: 'All Queues: see every department',
        intro: 'Supervisors use All Queues to see all departments on one screen.',
        steps: [
          ['Open **All Queues** from Home.', 'all-queues.png'],
          ['Each department has a column. It shows **NOW SERVING** and the tickets that wait.'],
          ['Each ticket has **Print**, **Skip**, **Transfer** and **Cancel** buttons.'],
          ['To move a ticket to another department, click **Transfer** on that ticket.', 'all-queues-transfer.png'],
          ['Under **Transfer to**, choose the new department. The reason is optional here. Click **Transfer**.'],
        ],
        tips: [
          'At the top you see the total: for example "9 waiting • 2 serving • 0 served today".',
          'A transferred ticket keeps the same ticket number.',
          'Use this screen to find a department with a long wait and help it.',
        ],
      },
      ar: {
        title: 'كل الطوابير: عرض جميع الأقسام',
        intro: 'يستخدم المشرفون All Queues لرؤية جميع الأقسام في شاشة واحدة.',
        steps: [
          ['افتح **All Queues** من الشاشة الرئيسية.', 'all-queues.png'],
          ['لكل قسم عمود. يعرض **NOW SERVING** والتذاكر المنتظرة.'],
          ['لكل تذكرة أزرار **Print** و **Skip** و **Transfer** و **Cancel**.'],
          ['لنقل تذكرة إلى قسم آخر اضغط **Transfer** على تلك التذكرة.', 'all-queues-transfer.png'],
          ['من **Transfer to** اختر القسم الجديد. السبب اختياري هنا. ثم اضغط **Transfer**.'],
        ],
        tips: [
          'في الأعلى ترى الإجمالي، مثل "9 waiting • 2 serving • 0 served today".',
          'التذكرة المنقولة تحتفظ بنفس الرقم.',
          'استخدم هذه الشاشة لإيجاد قسم فيه انتظار طويل ومساعدته.',
        ],
      },
    },
    {
      id: '06-queue-control',
      en: {
        title: 'Queue Control: skip, transfer, recall, no-show',
        intro: 'Queue Control shows one card for each department. Use the buttons when a parent does not come or goes to the wrong desk.',
        steps: [
          ['Open **Queue Control**. Each card shows **NOW SERVING** and **UP NEXT**. Click **Call Next** to call the next ticket.', 'queue-control.png'],
          ['**Complete**: the parent is finished.'],
          ['**Recall**: calls the same ticket again.'],
          ['**Skip**: sends the ticket to the end of the queue. The number of calls goes back to zero.'],
          ['**No-Show**: use it when the parent never came. It unlocks only after the ticket was called the set number of times (the button shows, for example, 2/3). The default is 3 calls.'],
          ['**Transfer**: moves the ticket to another department. Write a reason. The ticket number stays the same.', 'queue-transfer.png'],
        ],
        tips: [
          'Check the ticket number before you press a button.',
          'To cancel a ticket because the parent left, use **CANCEL / LEFT** on the Queue Dashboard. You must write a reason, and you cannot undo it.',
          'No-Show is final. If you are not sure, use Skip.',
        ],
      },
      ar: {
        title: 'التحكم بالطابور: تخطي ونقل ونداء وعدم حضور',
        intro: 'تعرض Queue Control بطاقة لكل قسم. استخدم الأزرار عندما لا يحضر ولي الأمر أو يذهب إلى مكتب خاطئ.',
        steps: [
          ['افتح **Queue Control**. تعرض كل بطاقة **NOW SERVING** و **UP NEXT**. اضغط **Call Next** لنداء التذكرة التالية.', 'queue-control.png'],
          ['**Complete**: انتهت خدمة ولي الأمر.'],
          ['**Recall**: ينادي على نفس التذكرة مرة أخرى.'],
          ['**Skip**: ينقل التذكرة إلى نهاية الطابور ويعيد عدد النداءات إلى الصفر.'],
          ['**No-Show**: استخدمه إذا لم يحضر ولي الأمر أبداً. يُفتح فقط بعد نداء التذكرة العدد المحدد من المرات (يظهر على الزر مثل 2/3). العدد الافتراضي 3 نداءات.'],
          ['**Transfer**: ينقل التذكرة إلى قسم آخر. اكتب السبب. يبقى رقم التذكرة كما هو.', 'queue-transfer.png'],
        ],
        tips: [
          'تأكد من رقم التذكرة قبل الضغط على أي زر.',
          'لإلغاء تذكرة لأن ولي الأمر غادر، استخدم **CANCEL / LEFT** في Queue Dashboard. يجب كتابة السبب ولا يمكن التراجع.',
          'No-Show نهائي. إذا لم تكن متأكداً استخدم Skip.',
        ],
      },
    },
    {
      id: '07-announcements',
      en: {
        title: 'Announcements',
        intro: 'Announcements are messages that scroll on the TV Display. You can also read them aloud on the TV Display at any time.',
        steps: [
          ['Open **Announcements**. You see the list of messages.', 'announcements.png'],
          ['Find the message you need. Click **Announce** to say it now on the TV Display.'],
          ['Some messages repeat. The line under the message shows this, for example **Repeats 3× every 5 min**. After you click **Announce**, the message plays again by itself.', 'announcements-repeating.png'],
          ['While a message repeats, its row shows **Repeating** with the count and the time of the next one. Click **Stop** to end the repeats.'],
          ['A ticket call is never cut. The announcement waits for the call, or plays again after it.'],
        ],
        tips: [
          'Only an administrator can add, change or delete messages, and set how often they repeat.',
          'Messages marked **Showing on display** also scroll on the TV.',
        ],
      },
      ar: {
        title: 'الإعلانات',
        intro: 'الإعلانات رسائل تتحرك على شاشة العرض. ويمكنك أيضاً قراءتها بالصوت على شاشة العرض في أي وقت.',
        steps: [
          ['افتح **Announcements**. ستظهر قائمة الرسائل.', 'announcements.png'],
          ['اختر الرسالة المطلوبة واضغط **Announce** لإذاعتها الآن على شاشة العرض.'],
          ['بعض الرسائل تتكرر. السطر تحت الرسالة يوضح ذلك، مثل **Repeats 3× every 5 min**. بعد الضغط على **Announce** تُعاد الرسالة تلقائياً.', 'announcements-repeating.png'],
          ['أثناء التكرار يظهر في صف الرسالة **Repeating** مع العدد ووقت الرسالة التالية. اضغط **Stop** لإيقاف التكرار.'],
          ['نداء التذاكر لا يُقطع أبداً: الإعلان ينتظر النداء، أو يُعاد بعده.'],
        ],
        tips: [
          'المسؤول فقط يستطيع إضافة الرسائل أو تعديلها أو حذفها، وتحديد عدد مرات التكرار.',
          'الرسائل المكتوب عليها **Showing on display** تتحرك أيضاً على التلفاز.',
        ],
      },
    },
    {
      id: '08-reports',
      en: {
        title: 'Reports',
        intro: 'Reports show how the school served parents. You can save them as PDF or Excel.',
        steps: [
          ['Open **Reports**.', 'reports.png'],
          ['Choose a tab: **Daily Summary**, **Service Types**, **Transfers**, **Visit Purposes** or **Ticket Log**.'],
          ['Choose the date (**Select Date**).'],
          ['Click **Generate Report**.'],
          ['To save it, click **Export PDF** or **Export Excel**.', 'reports-ticket-log.png'],
        ],
        tips: [
          'Click **Generate Report** again after you change the dates.',
          '**Ticket Log** lists every ticket one by one.',
        ],
      },
      ar: {
        title: 'التقارير',
        intro: 'تعرض التقارير كيف خدمت المدرسة أولياء الأمور. يمكنك حفظها بصيغة PDF أو Excel.',
        steps: [
          ['افتح **Reports**.', 'reports.png'],
          ['اختر تبويباً: **Daily Summary** أو **Service Types** أو **Transfers** أو **Visit Purposes** أو **Ticket Log**.'],
          ['اختر التاريخ (**Select Date**).'],
          ['اضغط **Generate Report**.'],
          ['للحفظ اضغط **Export PDF** أو **Export Excel**.', 'reports-ticket-log.png'],
        ],
        tips: [
          'اضغط **Generate Report** مرة أخرى بعد تغيير التواريخ.',
          '**Ticket Log** يعرض كل تذكرة على حدة.',
        ],
      },
    },
    {
      id: '09-kiosk',
      en: {
        title: 'Self-Service Kiosk',
        intro: 'The kiosk is a touch screen. Parents make their own ticket.',
        steps: [
          ['The parent touches **Get a Ticket**.', 'kiosk-welcome.png'],
          ['The parent types the **Parent / Guardian Name**. The **Student Name** is optional. Touch **Next →**.', 'kiosk-details.png'],
          ['The parent chooses a department.', 'kiosk-department.png'],
          ['The parent chooses a service, or **Other / Not sure**.', 'kiosk-service.png'],
          ['The ticket prints by itself. The screen then goes back to the start.'],
        ],
        tips: [
          'Keep paper in the printer.',
          'If a parent needs help, make the ticket for them in Reception.',
        ],
      },
      ar: {
        title: 'كشك الخدمة الذاتية',
        intro: 'الكشك شاشة لمس. يُنشئ أولياء الأمور تذكرتهم بأنفسهم.',
        steps: [
          ['يلمس ولي الأمر **Get a Ticket**.', 'kiosk-welcome.png'],
          ['يكتب **Parent / Guardian Name**. **Student Name** اختياري. ثم يلمس **Next →**.', 'kiosk-details.png'],
          ['يختار القسم.', 'kiosk-department.png'],
          ['يختار الخدمة، أو **Other / Not sure**.', 'kiosk-service.png'],
          ['تُطبع التذكرة تلقائياً ثم تعود الشاشة إلى البداية.'],
        ],
        tips: [
          'احرص على وجود ورق في الطابعة.',
          'إذا احتاج ولي الأمر مساعدة، أنشئ التذكرة له من Reception.',
        ],
      },
    },
    {
      id: '10-tv-display',
      en: {
        title: 'TV Display',
        intro: 'The TV Display shows the queue to parents in the waiting area. It needs no sign-in.',
        steps: [
          ['Open **Display Monitor** on the TV computer.', 'display.png'],
          ['Each department has a column with **NOW SERVING** (the ticket and the counter), **NEXT** and **WAITING** (how many wait).'],
          ['Announcements scroll along the bottom of the screen.'],
          ['When a ticket is called, the screen shows it and the voice reads it.'],
        ],
        tips: [
          'Leave the screen open all day.',
          'If the screen is blank, check the network and that the server is on.',
        ],
      },
      ar: {
        title: 'شاشة العرض (التلفاز)',
        intro: 'تعرض شاشة العرض الطابور لأولياء الأمور في منطقة الانتظار. لا تحتاج إلى تسجيل دخول.',
        steps: [
          ['افتح **Display Monitor** على جهاز التلفاز.', 'display.png'],
          ['لكل قسم عمود فيه **NOW SERVING** (التذكرة والشباك) و **NEXT** و **WAITING** (عدد المنتظرين).'],
          ['تتحرك الإعلانات في أسفل الشاشة.'],
          ['عند نداء تذكرة تظهر على الشاشة ويقرأها الصوت.'],
        ],
        tips: [
          'اترك الشاشة مفتوحة طوال اليوم.',
          'إذا كانت الشاشة فارغة، تأكد من الشبكة ومن أن الخادم يعمل.',
        ],
      },
    },
  ],
};
