# Graph Report - gym  (2026-11-05)

## Corpus Check
- 312 files · ~222,846 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 85 file(s) not represented in the graph (top: .xml 24, (none) 9, .css 8)

## Summary
- 2872 nodes · 7600 edges · 120 communities (99 shown, 21 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 658 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `17de60f8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- onboarding.dart
- onboarding_art.dart
- query
- member-app/lib/main.dart
- lib/billing.js
- fallbackModel.js
- displayDate
- currency
- AppContext.jsx
- index.js
- createHttpError
- superadmin.js
- Gym Boo – Play Store Guide (for beginners)
- script.js
- useApp
- MemberDialog.jsx
- utils/billing.js
- lib/activity.js
- Icon
- dates.js
- todayKey
- pushController.js
- activityService.js
- bootstrapService.js
- partner.js
- displayDate
- checkin-frontend/package.json
- admin-app/lib/receipt_pdf.dart
- apiRoutes.js
- Flutter
- schema.sql
- qr.js
- TrainerDialog.jsx
- repo
- checkin.js
- package.json
- showToast
- authConfig
- bindEvents
- superAdminController.js
- dependencies
- memberController.js
- publicController.js
- onboarding.billing.test.js
- dependencies
- gym_boo/MainActivity.kt
- getBillingPeriodKeys
- checkin-frontend/src/lib/format.js
- Icon
- receipt.js
- notifications.dart
- checkin-frontend/src/lib/api.js
- usePushNotifications.js
- member-app/lib/config.dart
- tour_preview.dart
- plan-change.unit.test.js
- daily-log.db.test.js
- escapeHtml
- HelpView.jsx
- memberModel.js
- analytics.dart
- admin-frontend/package.json
- checkin-frontend/src/App.jsx
- autoNotificationService.js
- maintenanceService.js
- database.js
- activity.db.test.js
- plans.js
- Phase 1: Existing member onboarding and historical payment reconciliation
- CLAUDE.md
- nowIso
- notificationService.js
- init
- onboarding.db.test.js
- MemberHome.jsx
- InsightsAnalysis.jsx
- utils/dailyLog.js
- payment-edit.db.test.js
- landing/auth.js
- imageService.js
- gymModel.js
- Deploying to shared hosting — gymbot.toolszila.com
- Phase 3: Membership lifecycle (renewals, upgrades, downgrades, history)
- manifest.json
- signup.js
- activity-record.db.test.js
- site.js
- metaService.js
- pushSubscriptionModel.js
- PlanDialog.jsx
- env.js
- daily-log.unit.test.js
- flutter_native_splash
- flutter_native_splash
- flutter_launcher_icons
- flutter_launcher_icons
- admin-app/analysis_options.yaml
- member-app/analysis_options.yaml
- `.well-known/assetlinks.json`
- notifyThrottle.js
- 008-activity-history.sql
- admin-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md
- member-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md

## God Nodes (most connected - your core abstractions)
1. `query()` - 94 edges
2. `Icon()` - 82 edges
3. `createHttpError()` - 81 edges
4. `useApp()` - 75 edges
5. `exec()` - 75 edges
6. `repo()` - 75 edges
7. `currency()` - 72 edges
8. `displayDate()` - 71 edges
9. `createDomain()` - 57 edges
10. `todayKey()` - 56 edges

## Surprising Connections (you probably didn't know these)
- `3.3 Billing and Insights` --references--> `PaymentsView()`  [INFERRED]
  docs/phase-2-payment-management.md → admin-frontend/src/views/PaymentsView.jsx
- `5. Acceptance tests (`npm test`, Node's built-in `node:test`, no new dependencies)` --references--> `createMember()`  [INFERRED]
  docs/phase-1-existing-member-onboarding.md → backend/src/services/memberService.js
- `4.1 Database (only adds things; no existing row changes meaning)` --references--> `ensureFeatureColumns()`  [INFERRED]
  docs/phase-1-existing-member-onboarding.md → backend/src/services/migrationService.js
- `1. Audit: what exists today` --references--> `monthly()`  [INFERRED]
  docs/phase-3-membership-lifecycle.md → backend/test/activity.unit.test.js
- `Code that exists in both apps` --references--> `invoiceHtml()`  [INFERRED]
  mobile-app/README.md → checkin-frontend/src/lib/receipt.js

## Import Cycles
- None detected.

## Communities (120 total, 21 thin omitted)

### Community 0 - "onboarding.dart"
Cohesion: 0.02
Nodes (98): action, autofill, _back, bottomInset, build, _buildDone, _buildGymStep, _buildLoginStep (+90 more)

### Community 1 - "onboarding_art.dart"
Cohesion: 0.03
Nodes (85): GymBooApp, amber, amberSoft, amp, ArtColors, _Avatar, _BarsPainter, bg (+77 more)

### Community 2 - "query"
Cohesion: 0.06
Nodes (71): exec(), query(), raw(), getPublicStats(), readStats(), insertActivities(), listActivities(), mapActivityRow() (+63 more)

### Community 3 - "member-app/lib/main.dart"
Cohesion: 0.03
Nodes (54): _applySession, build, _controller, createState, darkBars, didChangeMetrics, dispose, _downloads (+46 more)

### Community 4 - "lib/billing.js"
Cohesion: 0.12
Nodes (63): ADMISSION_PERIOD_KEY, billingStartKey(), createDomain(), expenseCategoryLabel(), EXTRA_PERIOD_KEY, firstPlanPeriodKey(), formatBillingPeriodRange(), getAdvanceTerm() (+55 more)

### Community 5 - "fallbackModel.js"
Cohesion: 0.06
Nodes (41): getDailyLogRecords(), ms(), addOtherPayment(), addPayments(), applyPlanChange(), attendanceStatusRows(), bumpAttendanceRevision(), createCheckin() (+33 more)

### Community 6 - "displayDate"
Cohesion: 0.11
Nodes (50): DayBar(), dayHeading(), shiftDay(), PeriodBar(), usePeriodSelection(), PaymentRow(), paymentTitle(), roomFor() (+42 more)

### Community 7 - "currency"
Cohesion: 0.11
Nodes (46): PaymentHistoryItem(), DayLedgerDialog(), DetailDialog(), PaymentEditDialog(), collectionTimingLabel(), DATE_NOT_RECORDED, planLabel(), addDays() (+38 more)

### Community 8 - "AppContext.jsx"
Cohesion: 0.07
Nodes (42): LoginOverlay(), PasswordInput(), apiContext, clearToken(), fetchMe(), getToken(), login(), logout() (+34 more)

### Community 9 - "index.js"
Cohesion: 0.07
Nodes (41): start(), createApp(), express, ADMIN_DIR, ADMIN_DIST, ASSET_LINKS_PATH, BACKEND_ROOT, CHECKIN_DIR (+33 more)

### Community 10 - "createHttpError"
Cohesion: 0.09
Nodes (44): referralConfig(), getProgram(), clean(), crypto, postReview(), createGymWithAdmin(), createStaff(), login() (+36 more)

### Community 11 - "superadmin.js"
Cohesion: 0.11
Nodes (48): MONTHS, actionsFor(), api(), askNote(), badge(), chips(), date(), datetime() (+40 more)

### Community 12 - "Gym Boo – Play Store Guide (for beginners)"
Cohesion: 0.04
Nodes (47): 2.1 Privacy policy, 2.2 App access, 2.3 Ads, 2.4 Content rating, 2.5 Target audience, 2.6 Data safety (the longest form – answer honestly), 2.7 Other declarations, 2.8 Account deletion (+39 more)

### Community 13 - "script.js"
Cohesion: 0.08
Nodes (46): addHolidayDate(), applyTheme(), authState, CHECKIN_STATUS_COPY, els, EXPENSE_CATEGORIES, expenseCategoryLabel(), exportFinanceCsv() (+38 more)

### Community 14 - "useApp"
Cohesion: 0.11
Nodes (34): App(), SidebarScrim(), ViewPanel(), VIEWS, AppTabbar(), PARENT_TAB, TABS, MaintenanceNotice() (+26 more)

### Community 15 - "MemberDialog.jsx"
Cohesion: 0.11
Nodes (37): clampToFee(), ExistingMemberHistory(), ExistingMemberReview(), ModeSelect(), ORDINALS, PaidOn(), paymentTitle(), StatusButtons() (+29 more)

### Community 16 - "utils/billing.js"
Cohesion: 0.14
Nodes (44): checkInMember(), changeMemberPlan(), crypto, firstPeriodKey(), listPlanChanges(), periodStartKey(), readPlan(), rupees() (+36 more)

### Community 17 - "lib/activity.js"
Cohesion: 0.08
Nodes (42): ActivityPanel(), countOf(), monthShortOf(), weekdayOf(), ACTIVITY_TYPES, activityCard(), activityCsvRows(), activityDayKey() (+34 more)

### Community 18 - "Icon"
Cohesion: 0.12
Nodes (34): EmptyState(), Icon(), Photo(), WhatsAppIcon(), useProgressiveList(), FEE_STATUS_LABELS, daysBetween(), monthKey() (+26 more)

### Community 19 - "dates.js"
Cohesion: 0.12
Nodes (29): AuthBar(), GymsDialog(), StaffDialog(), Dialog(), NAV_SECTIONS, Sidebar(), UndatedPaymentsSheet(), api() (+21 more)

### Community 20 - "todayKey"
Cohesion: 0.12
Nodes (30): getAttendanceStatus(), setAttendance(), getTodayCode(), listCheckins(), assertNotBackdated(), assertUniqueMember(), createMember(), crypto (+22 more)

### Community 21 - "pushController.js"
Cohesion: 0.12
Nodes (32): firebaseConfig(), pushConfig(), deleteSubscribe(), getMySubscriptions(), getPublicKey(), postNativeSubscribe(), postSubscribe(), resolveMemberGym() (+24 more)

### Community 22 - "activityService.js"
Cohesion: 0.10
Nodes (32): getActivities(), actorFrom(), backfillActivities(), classifyLines(), dayBefore(), isoOf(), listActivities(), localKey() (+24 more)

### Community 23 - "bootstrapService.js"
Cohesion: 0.11
Nodes (29): DEFAULT_SETTINGS, LEGACY_DB_PATH, importAttendance(), importCheckin(), getSettings(), saveSettings(), getAttendanceRevision(), getSettings() (+21 more)

### Community 24 - "partner.js"
Cohesion: 0.07
Nodes (27): 1.1 Additional requirements → how they're met, 1. Approved decisions, 3.1 Data model (adds only), 3.2 Recording: `POST /members/:id/payments` (extended; old body still accepted), 3.3 Billing and Insights, 3.4 Corrections (P3, P5), 3.5 Reversals (P5, P6), 3.6 Admin UI (+19 more)

### Community 25 - "displayDate"
Cohesion: 0.13
Nodes (34): currency(), displayDate(), getBillingAmountLabel(), getDueDateKey(), getFilteredPaymentMembers(), getLastPaymentText(), getMembershipLabel(), getMonthlyAttendance() (+26 more)

### Community 26 - "checkin-frontend/package.json"
Cohesion: 0.08
Nodes (31): dependencies, jsqr@^1.4.0, react@^18.3.1, react-dom@^18.3.1, description, devDependencies, autoprefixer@^10.4.20, postcss@^8.4.49 (+23 more)

### Community 27 - "admin-app/lib/receipt_pdf.dart"
Cohesion: 0.06
Nodes (28): buildReceiptPdf, document, field, green, ink, label, line, mode (+20 more)

### Community 28 - "apiRoutes.js"
Cohesion: 0.13
Nodes (22): enforceAccess(), resolveVerdict(), verdicts, authenticate(), readToken(), requireRole(), resolveTenant(), attempts (+14 more)

### Community 29 - "Flutter"
Cohesion: 0.08
Nodes (9): Flutter, AppDelegate, SceneDelegate, RunnerTests, AppDelegate, SceneDelegate, RunnerTests, UIKit (+1 more)

### Community 30 - "schema.sql"
Cohesion: 0.10
Nodes (27): push_subscriptions, member_plan_changes, meta_devices, meta_sent_purchases, gym_activity, app_settings, attendance, checkins (+19 more)

### Community 31 - "qr.js"
Cohesion: 0.11
Nodes (28): ALIGN_POS, applyMask(), bchFormat(), bchVersion(), BitBuffer, buildDataCodewords(), buildMatrix(), createMatrix() (+20 more)

### Community 32 - "TrainerDialog.jsx"
Cohesion: 0.16
Nodes (25): FieldError(), PhoneField(), FIELD_IDS, FIELD_ORDER, SHIFT_PRESETS, TrainerDialog(), normalizePhone(), ALLOWED_TYPES (+17 more)

### Community 33 - "repo"
Cohesion: 0.16
Nodes (25): deleteExpense(), EXPENSE_FIELDS, listExpenses(), postExpense(), putExpense(), snapshot(), validateExpense(), deleteMember() (+17 more)

### Community 34 - "checkin.js"
Cohesion: 0.09
Nodes (30): applyTheme(), brandMark, button, checkIn(), displayDate(), displayTime(), forget, form (+22 more)

### Community 35 - "package.json"
Cohesion: 0.08
Nodes (30): dependencies, dotenv@^17.4.2, express@^4.19.2, firebase-admin@^14.5.0, qrcode@^1.5.4, sharp@^0.35.3, web-push@^3.6.7, description (+22 more)

### Community 36 - "showToast"
Cohesion: 0.17
Nodes (30): api(), applyAuthedUser(), authEl(), bindAuthEvents(), bootAuth(), clearToken(), closeExpenseDialogBox(), closeMemberDialog() (+22 more)

### Community 37 - "authConfig"
Cohesion: 0.11
Nodes (13): authConfig(), postLogin(), postLogout(), postSignup(), setSessionCookie(), postLogin(), postLogout(), postSignup() (+5 more)

### Community 38 - "bindEvents"
Cohesion: 0.14
Nodes (28): applyAttendanceStatus(), bindEvents(), closeDetail(), closeDrawer(), closeFeeDialog(), closeTrainerDialog(), collectSelectedFees(), deleteCurrentTrainer() (+20 more)

### Community 39 - "superAdminController.js"
Cohesion: 0.08
Nodes (8): deleteReview(), getOverview(), listGyms(), listReviews(), num(), postLogin(), setReviewStatus(), setSuperCookie()

### Community 40 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, firebase_core, firebase_messaging, flutter, flutter_local_notifications, image_picker, pdf, permission_handler (+19 more)

### Community 41 - "memberController.js"
Cohesion: 0.19
Nodes (21): addPayments(), deletePayment(), listMembers(), postOtherPayment(), PROFILE_FIELDS, putPayment(), putPaymentDate(), paymentLine() (+13 more)

### Community 42 - "publicController.js"
Cohesion: 0.15
Nodes (24): getAccountSession(), getPublicCheckinHistory(), getPublicSettings(), postAccountLogin(), postPublicCheckin(), resolveGymBySlug(), setMemberSessionCookie(), attempts (+16 more)

### Community 43 - "onboarding.billing.test.js"
Cohesion: 0.10
Nodes (18): newMember(), assert, monthly(), OWNER, RAHUL, test, ADMIN_LIB, existingMember() (+10 more)

### Community 44 - "dependencies"
Cohesion: 0.07
Nodes (26): dependencies, facebook_app_events, flutter, http, image_picker, pdf, printing, share_plus (+18 more)

### Community 46 - "getBillingPeriodKeys"
Cohesion: 0.19
Nodes (26): addMonths(), daysBetween(), formatBillingPeriodRange(), getBillablePeriodKeys(), getBillingCycleDays(), getBillingCycleMode(), getBillingPeriodKeys(), getBillingPeriodLabel() (+18 more)

### Community 47 - "checkin-frontend/src/lib/format.js"
Cohesion: 0.16
Nodes (19): AttendanceCard(), DayCell(), DashboardHeader(), MemberPanel(), SOURCE_LABEL(), NextDueCard(), dateFormat, displayDate() (+11 more)

### Community 48 - "Icon"
Cohesion: 0.16
Nodes (16): Icon(), STEPS, COPY, MissingGymNotice(), PhoneCheckinCard(), QrScannerCard(), StatusNote(), TONES (+8 more)

### Community 49 - "receipt.js"
Cohesion: 0.24
Nodes (22): byNewest(), InvoicesCard(), displayPeriod(), rupees(), isAppShell(), balanceAfter(), downloadInvoice(), escapeHtml() (+14 more)

### Community 50 - "notifications.dart"
Cohesion: 0.08
Nodes (14): askUntilAllowed, enable, _fcm, GymNotifications, handleBridge, init, instance, launchUrl (+6 more)

### Community 51 - "checkin-frontend/src/lib/api.js"
Cohesion: 0.20
Nodes (20): EMPTY, useCheckin(), FALLBACK, SIGNED_OUT, useMemberAccount(), fetchAccountSession(), fetchCheckinHistory(), fetchGymSettings() (+12 more)

### Community 52 - "usePushNotifications.js"
Cohesion: 0.18
Nodes (17): isStandalone(), manifestHref(), readPlatform(), useInstallPrompt(), IDLE, usePushNotifications(), fetchPushPublicKey(), isNativeApp() (+9 more)

### Community 53 - "member-app/lib/config.dart"
Cohesion: 0.09
Nodes (19): kAllowedPathPrefixes, kAppName, kAppUrl, kBrandColor, kShowTourButton, kSplashColor, kSplashImage, kStartPath (+11 more)

### Community 54 - "tour_preview.dart"
Cohesion: 0.10
Nodes (15): WebShell, _WebShellState, GymSetupScreen, _GymSetupScreenState, OnboardingScreen, _OnboardingScreenState, build, createState (+7 more)

### Community 55 - "plan-change.unit.test.js"
Cohesion: 0.11
Nodes (18): Backend Database, Setup, Tables, termPayment(), agree(), assert, fakeModels, GYMS (+10 more)

### Community 56 - "daily-log.db.test.js"
Cohesion: 0.10
Nodes (16): assert, hasDb, localDay(), memberPayload(), mysql, opts, path, test (+8 more)

### Community 57 - "escapeHtml"
Cohesion: 0.15
Nodes (21): escapeHtml(), exportHistoryCsv(), filterHistoryRows(), getAssignedMemberCount(), getDefaultHistoryRange(), getHistoryRange(), getHistoryRows(), getInitials() (+13 more)

### Community 58 - "HelpView.jsx"
Cohesion: 0.20
Nodes (15): MENU_TOUR_EVENT, VideoDialog(), downloadCsv(), HELP_FAQ, HELP_GUIDE, HELP_VIDEO_LABEL, HELP_VIDEOS, isAppShell() (+7 more)

### Community 59 - "memberModel.js"
Cohesion: 0.15
Nodes (20): getPool(), applyPlanChange(), clearTrainerFromMembers(), countMembers(), createMemberWithHistory(), crypto, deleteMember(), findMember() (+12 more)

### Community 60 - "analytics.dart"
Cohesion: 0.10
Nodes (13): Analytics, anonymousId, _events, _fb, _firstTime, handleBridge, _lastContact, _log (+5 more)

### Community 61 - "admin-frontend/package.json"
Cohesion: 0.12
Nodes (19): dependencies, react@^18.3.1, react-dom@^18.3.1, description, devDependencies, vite@^5.4.11, @vitejs/plugin-react@^4.3.4, react (+11 more)

### Community 62 - "checkin-frontend/src/App.jsx"
Cohesion: 0.23
Nodes (16): App(), PAGE_TITLES, BrandHeader(), DefaultEmblem(), ITEMS, MemberNav(), useGymBranding(), clearLastGym() (+8 more)

### Community 63 - "autoNotificationService.js"
Cohesion: 0.30
Nodes (18): autoNotifyConfig(), postPlanChange(), daysText(), enabled(), notifyCheckin(), notifyPayment(), notifyWelcome(), runClaimedDaily() (+10 more)

### Community 64 - "maintenanceService.js"
Cohesion: 0.25
Nodes (18): addDays(), addYear(), compute(), crypto, daysBetween(), fromIso(), getBilling(), isLocked() (+10 more)

### Community 65 - "database.js"
Cohesion: 0.14
Nodes (15): DATA_DIR, SCHEMA_PATH, fs, initDatabase(), mysql, dbConfig(), crypto, getActivityRecords() (+7 more)

### Community 66 - "activity.db.test.js"
Cohesion: 0.12
Nodes (11): assert, crypto, hasDb, mysql, opts, OWNER, path, record() (+3 more)

### Community 67 - "plans.js"
Cohesion: 0.29
Nodes (17): alertInline(), api(), breakdownHtml(), claim(), esc(), load(), notice(), planCard() (+9 more)

### Community 68 - "Phase 1: Existing member onboarding and historical payment reconciliation"
Cohesion: 0.12
Nodes (16): periods(), 1.2 Answers to the open questions, 1.3 Additional confirmations, 1. Approved decisions, 3. Resolved conflicts (all approved), 4.1 Database (only adds things; no existing row changes meaning), 4.2 API: `POST /api/members` (backward compatible), 4.4 Fee reminder hold (D4, C2, C3) (+8 more)

### Community 69 - "CLAUDE.md"
Cohesion: 0.12
Nodes (16): 1. Role and Engineering Mindset, 2. Understand the Existing Project Before Making Changes, 3. Brand Identity and Visual Consistency, 4. Premium Micro-Interactions and Animations, 5. Responsive Design Is Mandatory, 6. Pricing Must Be Immediately Clear, 7. Landing Page Must Build Trust and Convert, 8. Testimonials and Trust Signals (+8 more)

### Community 70 - "nowIso"
Cohesion: 0.21
Nodes (13): createCheckin(), crypto, findCheckinForDate(), getCheckinsByDate(), mapCheckinRow(), deleteTrainer(), getAllTrainers(), getTrainerById() (+5 more)

### Community 71 - "notificationService.js"
Cohesion: 0.28
Nodes (15): assertPushAvailable(), AUDIENCES, dueText(), feeReminderPreview(), feeReminderRecipients(), gymContext(), inExistingMemberHold(), membersWithPendingFees() (+7 more)

### Community 72 - "init"
Cohesion: 0.19
Nodes (15): ensureMemberGymIds(), ensureMemberTrainerFields(), generateGymId(), init(), loadExpenses(), loadMembers(), loadSettings(), persistAllMembers() (+7 more)

### Community 73 - "onboarding.db.test.js"
Cohesion: 0.14
Nodes (10): assert, existingPayload(), hasDb, mysql, nextPhone(), opts, path, settings() (+2 more)

### Community 74 - "MemberHome.jsx"
Cohesion: 0.29
Nodes (11): InstallBanner(), MemberStatPills(), Pill(), NotificationCard(), currentStreak(), dateKey(), rupeeFormat, visitsThisMonth() (+3 more)

### Community 75 - "InsightsAnalysis.jsx"
Cohesion: 0.26
Nodes (11): axisLabel(), ColumnChart(), BreakdownRow(), InsightsAnalysis(), tickEvery(), buildTrend(), emptyPoint(), monthShort (+3 more)

### Community 76 - "utils/dailyLog.js"
Cohesion: 0.25
Nodes (9): listDailyLog(), getDailyLog(), buildDailyLog(), inRange(), iso(), isPart(), memberRef(), near() (+1 more)

### Community 77 - "payment-edit.db.test.js"
Cohesion: 0.16
Nodes (10): assert, hasDb, mysql, opts, path, reload(), settings(), status() (+2 more)

### Community 78 - "landing/auth.js"
Cohesion: 0.18
Nodes (4): sanitizeName(), setStep(), showFormError(), wireForm()

### Community 79 - "imageService.js"
Cohesion: 0.21
Nodes (12): UPLOAD_DIR, crypto, DEFAULT_PROFILE, fs, path, PROFILES, reject(), saveImageData() (+4 more)

### Community 80 - "gymModel.js"
Cohesion: 0.27
Nodes (10): createGym(), crypto, getGymById(), getGymBySlug(), listGyms(), mapGymRow(), setGymStatus(), uniqueSlug() (+2 more)

### Community 81 - "Deploying to shared hosting — gymbot.toolszila.com"
Cohesion: 0.17
Nodes (11): 1. Create the MySQL database (cPanel → MySQL Databases), 2. Point the subdomain at an app folder, 3. Upload the project, 4. Create the environment file (`.env`), 5. Create the Node.js app (cPanel → Setup Node.js App), 6. Verify, Deploying to shared hosting — gymbot.toolszila.com, If Node.js isn't available on your plan (+3 more)

### Community 82 - "Phase 3: Membership lifecycle (renewals, upgrades, downgrades, history)"
Cohesion: 0.17
Nodes (11): 2. Blockers and conflicts with the spec, 3. Decisions needed (recommendation in bold), 4.3 Renewal, 4.4 Upgrade and downgrade, 4.5 Membership history, 4.6 Member app, 4. Design (assuming the recommendations), 5. Tests (all automated, both billing copies) (+3 more)

### Community 83 - "manifest.json"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, id, name, orientation, scope (+3 more)

### Community 84 - "signup.js"
Cohesion: 0.24
Nodes (7): emailError(), nameError(), paint(), paintStrength(), strengthOf(), validate(), values()

### Community 85 - "activity-record.db.test.js"
Cohesion: 0.20
Nodes (9): assert, hasDb, localDay(), mysql, opts, OWNER, path, shift() (+1 more)

### Community 86 - "site.js"
Cohesion: 0.22
Nodes (5): avatar(), countUp(), el(), play(), renderVideos()

### Community 87 - "metaService.js"
Cohesion: 0.33
Nodes (7): enabled(), extInfo(), metaConfig(), post(), saveDevice(), sendApprovedPurchase(), sentPurchaseIds()

### Community 88 - "pushSubscriptionModel.js"
Cohesion: 0.33
Nodes (9): countPushSubscriptionsForMember(), crypto, deletePushSubscription(), deletePushSubscriptionByEndpoint(), endpointHash(), listPushSubscriptionsForMember(), listPushSubscriptionsForMembers(), mapSubscriptionRow() (+1 more)

### Community 89 - "PlanDialog.jsx"
Cohesion: 0.42
Nodes (8): monthsLabel(), PACKAGE_PRESETS, PlanDialog(), PlanForm(), shortDate(), STEP_NAMES, termRange(), monthLabelFromKey()

### Community 90 - "env.js"
Cohesion: 0.36
Nodes (7): qrSvg(), trialConfig(), accessOf(), claimPayment(), getStatus(), qrDataUrl(), upiUri()

### Community 91 - "daily-log.unit.test.js"
Cohesion: 0.28
Nodes (7): assert, at(), DAY, member(), pay(), RANGE, test

### Community 92 - "flutter_native_splash"
Cohesion: 0.22
Nodes (8): color, image, flutter_native_splash, android_12, color, image, ios, web

### Community 93 - "flutter_native_splash"
Cohesion: 0.22
Nodes (8): color, image, flutter_native_splash, android_12, color, image, ios, web

### Community 94 - "flutter_launcher_icons"
Cohesion: 0.25
Nodes (7): flutter_launcher_icons, adaptive_icon_background, adaptive_icon_foreground, android, image_path, ios, remove_alpha_ios

### Community 95 - "flutter_launcher_icons"
Cohesion: 0.25
Nodes (7): flutter_launcher_icons, adaptive_icon_background, adaptive_icon_foreground, android, image_path, ios, remove_alpha_ios

### Community 96 - "admin-app/analysis_options.yaml"
Cohesion: 0.33
Nodes (5): analyzer, exclude, include, linter, rules

### Community 97 - "member-app/analysis_options.yaml"
Cohesion: 0.33
Nodes (5): analyzer, exclude, include, linter, rules

### Community 98 - "`.well-known/assetlinks.json`"
Cohesion: 0.33
Nodes (5): After editing, Filling it in, If you publish through Google Play, list two fingerprints, The `.env` alternative, `.well-known/assetlinks.json`

### Community 99 - "notifyThrottle.js"
Cohesion: 0.60
Nodes (4): keysFor(), notifyThrottle(), prune(), sends

## Knowledge Gaps
- **279 isolated node(s):** `Analytics`, `_fb`, `_events`, `_params`, `_oncePerKey` (+274 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 935 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `2. Audit (complete)` connect `memberModel.js` to `memberController.js`, `receipt.js`, `Icon`, `todayKey`, `partner.js`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **What connects `Analytics`, `_fb`, `_events` to the rest of the system?**
  _279 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `onboarding.dart` be split into smaller, more focused modules?**
  _Cohesion score 0.01680672268907563 - nodes in this community are weakly interconnected._
- **Why does `PaymentsView()` connect `Icon` to `displayDate`, `currency`, `useApp`, `partner.js`, `memberModel.js`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Should `onboarding_art.dart` be split into smaller, more focused modules?**
  _Cohesion score 0.025755879059350503 - nodes in this community are weakly interconnected._
- **Why does `preparePeriodPayments()` connect `memberController.js` to `fallbackModel.js`, `notificationService.js`, `createHttpError`, `onboarding.billing.test.js`, `utils/billing.js`, `memberModel.js`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `query` be split into smaller, more focused modules?**
  _Cohesion score 0.06044303797468355 - nodes in this community are weakly interconnected._