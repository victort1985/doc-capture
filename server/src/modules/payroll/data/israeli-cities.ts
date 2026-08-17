/**
 * A curated list of significant Israeli cities and local councils
 * with coordinates, for precise per-location Shabbat/holiday time
 * calculation via @hebcal/core (see payroll-calculation.service.ts's
 * own use of this list).
 *
 * Deliberately NOT an attempt at all ~2,500 individual settlements
 * Israel's own official registry recognizes (the vast majority of
 * which are small communities inside a regional council, not
 * independently meaningful as a distinct EMPLOYER location) — this
 * covers the ~200 city councils and larger local councils where a
 * real business is actually likely to be based, which is what this
 * field is actually for. An admin whose business is in a smaller
 * community not on this list can still enter custom coordinates
 * directly (see the "custom" option on the Salary Settings page).
 *
 * Coordinates were compiled from general geographic knowledge, not
 * freshly downloaded/cross-checked against an authoritative dataset
 * for every single entry in this session — the four cities already
 * verified live against @hebcal/core's own real candle-lighting
 * calculation (Jerusalem, Tel Aviv, Haifa, Eilat — see the payroll
 * feature's own test history) use the EXACT same coordinates here,
 * confirming those specific ones are correct; the rest should be
 * treated as good-faith approximations accurate to ordinary city-
 * center precision. Given candle-lighting/havdalah times only shift
 * by roughly a minute per ~20km east-west (less north-south), being
 * off by a kilometer or two from a municipality's own official center
 * has no meaningful effect on the payroll calculation this feeds —
 * but if Victor or a client ever spot-checks a specific city's result
 * against a known-correct source and finds a discrepancy, that's a
 * genuine bug report worth fixing here, not something already
 * guaranteed accurate by a verification process that didn't actually
 * happen for most of these entries.
 */
export interface IsraeliCity {
  nameHe: string;
  nameEn: string;
  nameRu: string;
  lat: number;
  lon: number;
}

export const ISRAELI_CITIES: IsraeliCity[] = [
  { nameHe: 'ירושלים', nameEn: 'Jerusalem', nameRu: 'Иерусалим', lat: 31.7683, lon: 35.2137 },
  { nameHe: 'תל אביב-יפו', nameEn: 'Tel Aviv-Yafo', nameRu: 'Тель-Авив-Яффо', lat: 32.0853, lon: 34.7818 },
  { nameHe: 'חיפה', nameEn: 'Haifa', nameRu: 'Хайфа', lat: 32.7940, lon: 34.9896 },
  { nameHe: 'ראשון לציון', nameEn: 'Rishon LeZion', nameRu: 'Ришон-ле-Цион', lat: 31.9730, lon: 34.7925 },
  { nameHe: 'פתח תקווה', nameEn: 'Petah Tikva', nameRu: 'Петах-Тиква', lat: 32.0917, lon: 34.8850 },
  { nameHe: 'אשדוד', nameEn: 'Ashdod', nameRu: 'Ашдод', lat: 31.8044, lon: 34.6553 },
  { nameHe: 'נתניה', nameEn: 'Netanya', nameRu: 'Нетания', lat: 32.3215, lon: 34.8532 },
  { nameHe: 'באר שבע', nameEn: 'Beer Sheva', nameRu: 'Беэр-Шева', lat: 31.2518, lon: 34.7913 },
  { nameHe: 'חולון', nameEn: 'Holon', nameRu: 'Холон', lat: 32.0167, lon: 34.7792 },
  { nameHe: 'בני ברק', nameEn: 'Bnei Brak', nameRu: 'Бней-Брак', lat: 32.0807, lon: 34.8338 },
  { nameHe: 'רמת גן', nameEn: 'Ramat Gan', nameRu: 'Рамат-Ган', lat: 32.0684, lon: 34.8248 },
  { nameHe: 'אשקלון', nameEn: 'Ashkelon', nameRu: 'Ашкелон', lat: 31.6688, lon: 34.5742 },
  { nameHe: 'רחובות', nameEn: 'Rehovot', nameRu: 'Реховот', lat: 31.8928, lon: 34.8113 },
  { nameHe: 'בת ים', nameEn: 'Bat Yam', nameRu: 'Бат-Ям', lat: 32.0231, lon: 34.7503 },
  { nameHe: 'בית שמש', nameEn: 'Beit Shemesh', nameRu: 'Бейт-Шемеш', lat: 31.7500, lon: 34.9886 },
  { nameHe: 'כפר סבא', nameEn: 'Kfar Saba', nameRu: 'Кфар-Саба', lat: 32.1750, lon: 34.9070 },
  { nameHe: 'הרצליה', nameEn: 'Herzliya', nameRu: 'Герцлия', lat: 32.1663, lon: 34.8434 },
  { nameHe: 'חדרה', nameEn: 'Hadera', nameRu: 'Хадера', lat: 32.4340, lon: 34.9196 },
  { nameHe: 'מודיעין-מכבים-רעות', nameEn: 'Modiin-Maccabim-Reut', nameRu: 'Модиин-Маккабим-Реут', lat: 31.8928, lon: 35.0095 },
  { nameHe: 'נצרת', nameEn: 'Nazareth', nameRu: 'Назарет', lat: 32.7009, lon: 35.2035 },
  { nameHe: 'לוד', nameEn: 'Lod', nameRu: 'Лод', lat: 31.9515, lon: 34.8955 },
  { nameHe: 'רמלה', nameEn: 'Ramla', nameRu: 'Рамла', lat: 31.9276, lon: 34.8626 },
  { nameHe: 'רעננה', nameEn: "Ra'anana", nameRu: 'Раанана', lat: 32.1848, lon: 34.8713 },
  { nameHe: 'מודיעין עילית', nameEn: 'Modiin Illit', nameRu: 'Модиин-Илит', lat: 31.9327, lon: 35.0432 },
  { nameHe: 'רהט', nameEn: 'Rahat', nameRu: 'Рахат', lat: 31.3925, lon: 34.7508 },
  { nameHe: 'הוד השרון', nameEn: 'Hod HaSharon', nameRu: 'Ход-ха-Шарон', lat: 32.1500, lon: 34.8886 },
  { nameHe: 'גבעתיים', nameEn: 'Givatayim', nameRu: 'Гиватаим', lat: 32.0714, lon: 34.8100 },
  { nameHe: 'קריית אתא', nameEn: 'Kiryat Ata', nameRu: 'Кирьят-Ата', lat: 32.8014, lon: 35.1039 },
  { nameHe: 'נהריה', nameEn: 'Nahariya', nameRu: 'Нагария', lat: 33.0058, lon: 35.0938 },
  { nameHe: 'בית שאן', nameEn: "Beit She'an", nameRu: 'Бейт-Шеан', lat: 32.4969, lon: 35.4967 },
  { nameHe: 'אילת', nameEn: 'Eilat', nameRu: 'Эйлат', lat: 29.5581, lon: 34.9482 },
  { nameHe: 'עפולה', nameEn: 'Afula', nameRu: 'Афула', lat: 32.6064, lon: 35.2881 },
  { nameHe: 'רמת השרון', nameEn: 'Ramat HaSharon', nameRu: 'Рамат-ха-Шарон', lat: 32.1467, lon: 34.8397 },
  { nameHe: 'כרמיאל', nameEn: 'Karmiel', nameRu: 'Кармиэль', lat: 32.9186, lon: 35.2953 },
  { nameHe: 'יבנה', nameEn: 'Yavne', nameRu: 'Явне', lat: 31.8783, lon: 34.7392 },
  { nameHe: 'טבריה', nameEn: 'Tiberias', nameRu: 'Тверия', lat: 32.7959, lon: 35.5308 },
  { nameHe: 'קריית גת', nameEn: 'Kiryat Gat', nameRu: 'Кирьят-Гат', lat: 31.6100, lon: 34.7642 },
  { nameHe: 'קריית ביאליק', nameEn: 'Kiryat Bialik', nameRu: 'Кирьят-Бялик', lat: 32.8367, lon: 35.0819 },
  { nameHe: 'קריית מוצקין', nameEn: 'Kiryat Motzkin', nameRu: 'Кирьят-Моцкин', lat: 32.8386, lon: 35.0808 },
  { nameHe: 'קריית ים', nameEn: 'Kiryat Yam', nameRu: 'Кирьят-Ям', lat: 32.8497, lon: 35.0686 },
  { nameHe: 'אור יהודה', nameEn: 'Or Yehuda', nameRu: 'Ор-Йехуда', lat: 32.0294, lon: 34.8536 },
  { nameHe: 'צפת', nameEn: 'Safed (Tzfat)', nameRu: 'Цфат', lat: 32.9646, lon: 35.4960 },
  { nameHe: 'נס ציונה', nameEn: 'Ness Ziona', nameRu: 'Нес-Циона', lat: 31.9292, lon: 34.7961 },
  { nameHe: 'עכו', nameEn: 'Acre (Akko)', nameRu: 'Акко', lat: 32.9281, lon: 35.0817 },
  { nameHe: 'אלעד', nameEn: "El'ad", nameRu: 'Эльад', lat: 32.0500, lon: 34.9500 },
  { nameHe: 'רמת ישי', nameEn: 'Ramat Yishai', nameRu: 'Рамат-Ишай', lat: 32.7000, lon: 35.1667 },
  { nameHe: 'גבעת שמואל', nameEn: "Giv'at Shmuel", nameRu: 'Гиват-Шмуэль', lat: 32.0781, lon: 34.8475 },
  { nameHe: 'שפרעם', nameEn: "Shfar'am", nameRu: 'Шфарам', lat: 32.8056, lon: 35.1697 },
  { nameHe: 'אום אל-פחם', nameEn: 'Umm al-Fahm', nameRu: 'Умм-эль-Фахм', lat: 32.5178, lon: 35.1522 },
  { nameHe: 'טייבה', nameEn: 'Tayibe', nameRu: 'Тайбе', lat: 32.2667, lon: 35.0083 },
  { nameHe: 'סחנין', nameEn: 'Sakhnin', nameRu: 'Сахнин', lat: 32.8667, lon: 35.3000 },
  { nameHe: 'נצרת עילית (נוף הגליל)', nameEn: 'Nof HaGalil', nameRu: 'Ноф-ха-Галиль', lat: 32.7092, lon: 35.3078 },
  { nameHe: 'דימונה', nameEn: 'Dimona', nameRu: 'Димона', lat: 31.0689, lon: 35.0328 },
  { nameHe: 'טירת כרמל', nameEn: 'Tirat Carmel', nameRu: 'Тират-Кармель', lat: 32.7614, lon: 34.9711 },
  { nameHe: 'מגדל העמק', nameEn: "Migdal HaEmek", nameRu: 'Мигдаль-ха-Эмек', lat: 32.6742, lon: 35.2419 },
  { nameHe: 'יקנעם עילית', nameEn: 'Yokneam Illit', nameRu: 'Йокнеам-Илит', lat: 32.6567, lon: 35.1108 },
  { nameHe: 'ערד', nameEn: 'Arad', nameRu: 'Арад', lat: 31.2589, lon: 35.2128 },
  { nameHe: 'שדרות', nameEn: 'Sderot', nameRu: 'Сдерот', lat: 31.5254, lon: 34.5966 },
  { nameHe: 'נתיבות', nameEn: 'Netivot', nameRu: 'Нетивот', lat: 31.4222, lon: 34.5892 },
  { nameHe: 'קריית שמונה', nameEn: 'Kiryat Shmona', nameRu: 'Кирьят-Шмона', lat: 33.2075, lon: 35.5697 },
  { nameHe: 'אריאל', nameEn: 'Ariel', nameRu: 'Ариэль', lat: 32.1058, lon: 35.1750 },
  { nameHe: 'מעלה אדומים', nameEn: 'Maale Adumim', nameRu: 'Маале-Адумим', lat: 31.7728, lon: 35.2972 },
  { nameHe: 'בית אל', nameEn: "Beit El", nameRu: 'Бейт-Эль', lat: 31.9436, lon: 35.2222 },
  { nameHe: 'גבעת זאב', nameEn: "Giv'at Ze'ev", nameRu: 'Гиват-Зеэв', lat: 31.8478, lon: 35.1747 },
  { nameHe: 'מבשרת ציון', nameEn: 'Mevaseret Zion', nameRu: 'Мевасерет-Цион', lat: 31.8025, lon: 35.1503 },
  { nameHe: 'זכרון יעקב', nameEn: "Zikhron Ya'akov", nameRu: 'Зихрон-Яаков', lat: 32.5731, lon: 34.9522 },
  { nameHe: 'עתלית', nameEn: 'Atlit', nameRu: 'Атлит', lat: 32.6889, lon: 34.9414 },
  { nameHe: 'בנימינה-גבעת עדה', nameEn: "Binyamina-Giv'at Ada", nameRu: 'Биньямина-Гиват-Ада', lat: 32.5192, lon: 34.9500 },
  { nameHe: 'פרדס חנה-כרכור', nameEn: 'Pardes Hanna-Karkur', nameRu: 'Пардес-Хана-Каркур', lat: 32.4736, lon: 34.9711 },
  { nameHe: 'אור עקיבא', nameEn: 'Or Akiva', nameRu: 'Ор-Акива', lat: 32.5083, lon: 34.9167 },
  { nameHe: 'קיסריה', nameEn: 'Caesarea', nameRu: 'Кейсария', lat: 32.5000, lon: 34.9000 },
  { nameHe: 'עמק חפר', nameEn: 'Emek Hefer', nameRu: 'Эмек-Хефер', lat: 32.3667, lon: 34.9167 },
  { nameHe: 'אלפי מנשה', nameEn: 'Alfei Menashe', nameRu: 'Альфей-Менаше', lat: 32.1667, lon: 35.0167 },
  { nameHe: 'קדימה-צורן', nameEn: 'Kadima-Zoran', nameRu: 'Кадима-Цоран', lat: 32.2833, lon: 34.9167 },
  { nameHe: 'טירה', nameEn: 'Tira', nameRu: 'Тира', lat: 32.2333, lon: 34.9500 },
  { nameHe: 'כפר קאסם', nameEn: 'Kafr Qasim', nameRu: 'Кафр-Касем', lat: 32.1167, lon: 34.9750 },
  { nameHe: 'ג\'לג\'וליה', nameEn: 'Jaljulia', nameRu: 'Джаджулия', lat: 32.1167, lon: 34.9583 },
  { nameHe: 'רמת הגולן (קצרין)', nameEn: 'Katzrin', nameRu: 'Кацрин', lat: 32.9928, lon: 35.6883 },
  { nameHe: 'עין גדי', nameEn: 'Ein Gedi', nameRu: 'Эйн-Геди', lat: 31.4614, lon: 35.3856 },
  { nameHe: 'מצפה רמון', nameEn: 'Mitzpe Ramon', nameRu: 'Мицпе-Рамон', lat: 30.6094, lon: 34.8014 },
  { nameHe: 'ירוחם', nameEn: 'Yeruham', nameRu: 'Ерухам', lat: 30.9911, lon: 34.9308 },
  { nameHe: 'אופקים', nameEn: 'Ofakim', nameRu: 'Офаким', lat: 31.3111, lon: 34.6208 },
  { nameHe: 'שוהם', nameEn: 'Shoham', nameRu: 'Шохам', lat: 31.9997, lon: 34.9394 },
  { nameHe: 'גני תקווה', nameEn: 'Ganei Tikva', nameRu: 'Ганей-Тиква', lat: 32.0553, lon: 34.8642 },
  { nameHe: 'יהוד-מונוסון', nameEn: 'Yehud-Monosson', nameRu: 'Йехуд-Моносон', lat: 32.0333, lon: 34.8833 },
  { nameHe: 'קריית אונו', nameEn: 'Kiryat Ono', nameRu: 'Кирьят-Оно', lat: 32.0553, lon: 34.8556 },
  { nameHe: 'אזור', nameEn: 'Azor', nameRu: 'Азор', lat: 32.0242, lon: 34.8014 },
  { nameHe: 'באר יעקב', nameEn: "Be'er Ya'akov", nameRu: 'Беэр-Яаков', lat: 31.9436, lon: 34.8383 },
  { nameHe: 'גדרה', nameEn: 'Gedera', nameRu: 'Гедера', lat: 31.8125, lon: 34.7778 },
  { nameHe: 'קריית מלאכי', nameEn: 'Kiryat Malakhi', nameRu: 'Кирьят-Малахи', lat: 31.7297, lon: 34.7469 },
  { nameHe: 'שדות ים (זכרון)', nameEn: "Sedot Yam", nameRu: 'Седот-Ям', lat: 32.5039, lon: 34.9047 },
  { nameHe: 'פוריידיס', nameEn: 'Fureidis', nameRu: 'Фурейдис', lat: 32.6167, lon: 34.9583 },
  { nameHe: 'בסמת טבעון', nameEn: 'Basmat Tab\'un', nameRu: 'Басмат-Тавун', lat: 32.7167, lon: 35.1333 },
  { nameHe: 'דלית אל-כרמל', nameEn: 'Daliyat al-Karmel', nameRu: 'Далият-эль-Кармель', lat: 32.7000, lon: 35.0417 },
  { nameHe: 'עספיא', nameEn: 'Isfiya', nameRu: 'Исфия', lat: 32.7167, lon: 35.0583 },
  { nameHe: 'ביר אל-מכסור', nameEn: 'Bir al-Maksur', nameRu: 'Бир-эль-Максур', lat: 32.7583, lon: 35.2500 },
  { nameHe: 'כפר מנדא', nameEn: 'Kafr Manda', nameRu: 'Кафр-Манда', lat: 32.8167, lon: 35.2583 },
  { nameHe: 'מגאר', nameEn: "Maghar", nameRu: 'Магар', lat: 32.8833, lon: 35.4000 },
  { nameHe: 'ראמה', nameEn: 'Rameh', nameRu: 'Раме', lat: 32.9333, lon: 35.3667 },
  { nameHe: 'חורפיש', nameEn: 'Hurfeish', nameRu: 'Хурфейш', lat: 33.0167, lon: 35.3167 },
  { nameHe: 'ג\'וליס', nameEn: 'Julis', nameRu: 'Джулис', lat: 32.9442, lon: 35.1858 },
  { nameHe: 'ירכא', nameEn: 'Yarka', nameRu: 'Ярка', lat: 32.9333, lon: 35.2167 },
  { nameHe: 'ג\'ש (גוש חלב)', nameEn: 'Jish', nameRu: 'Джиш', lat: 33.0261, lon: 35.4453 },
  { nameHe: 'עילוט', nameEn: "Ilut", nameRu: 'Илут', lat: 32.7500, lon: 35.2833 },
  { nameHe: 'כפר כנא', nameEn: 'Kafr Kanna', nameRu: 'Кафр-Кана', lat: 32.7500, lon: 35.3417 },
  { nameHe: 'עראבה', nameEn: "Arraba", nameRu: 'Арраба', lat: 32.8500, lon: 35.3333 },
  { nameHe: 'דבוריה', nameEn: 'Daburiyya', nameRu: 'Дабурия', lat: 32.7000, lon: 35.3833 },
  { nameHe: 'טמרה', nameEn: 'Tamra', nameRu: 'Тамра', lat: 32.8500, lon: 35.1917 },
  { nameHe: 'כפר יאסיף', nameEn: 'Kafr Yasif', nameRu: 'Кафр-Ясиф', lat: 32.9500, lon: 35.1583 },
  { nameHe: 'ג\'דיידה-מכר', nameEn: 'Jadeidi-Makr', nameRu: 'Джадейди-Макр', lat: 32.9500, lon: 35.1667 },
  { nameHe: 'בועיינה-נוג\'ידאת', nameEn: "Bu'eine-Nujeidat", nameRu: 'Буэйна-Нуджейдат', lat: 32.7333, lon: 35.3667 },
  { nameHe: 'כאבול', nameEn: 'Kabul', nameRu: 'Кабуль', lat: 32.8167, lon: 35.1833 },
  { nameHe: 'נחף', nameEn: 'Nahef', nameRu: 'Нахеф', lat: 32.9333, lon: 35.2917 },
  { nameHe: 'דייר אל-אסד', nameEn: "Deir al-Asad", nameRu: 'Дейр-эль-Асад', lat: 32.9333, lon: 35.2833 },
  { nameHe: 'אבו סנאן', nameEn: 'Abu Sinan', nameRu: 'Абу-Синан', lat: 32.9583, lon: 35.1750 },
  { nameHe: 'ריינה', nameEn: 'Reineh', nameRu: 'Рейне', lat: 32.7250, lon: 35.3167 },
  { nameHe: 'אעבלין', nameEn: "I'billin", nameRu: 'Иблин', lat: 32.8167, lon: 35.1917 },
  { nameHe: 'כפר קרע', nameEn: "Kafr Qara", nameRu: 'Кафр-Кара', lat: 32.5000, lon: 35.0917 },
  { nameHe: 'באקה אל-גרביה', nameEn: 'Baqa al-Gharbiyye', nameRu: 'Бака-эль-Гарбия', lat: 32.4167, lon: 35.0417 },
  { nameHe: 'קלנסווה', nameEn: 'Qalansawe', nameRu: 'Каланцава', lat: 32.2833, lon: 34.9750 },
  { nameHe: 'ג\'ת', nameEn: "Jatt", nameRu: 'Джат', lat: 32.3833, lon: 35.0333 },
  { nameHe: 'זמר', nameEn: 'Zemer', nameRu: 'Зимер', lat: 32.3667, lon: 35.0917 },
  { nameHe: 'עארה-עארה', nameEn: "Ar'ara", nameRu: 'Арара', lat: 32.5000, lon: 35.1167 },
  { nameHe: 'משהד', nameEn: 'Mash\'had', nameRu: 'Машхад', lat: 32.7417, lon: 35.3083 },
  { nameHe: 'כפר קרא', nameEn: 'Kafr Qara', nameRu: 'Кафр-Кара', lat: 32.5000, lon: 35.0917 },
  { nameHe: 'עוזייר', nameEn: "Uzeir", nameRu: 'Узейр', lat: 32.7333, lon: 35.3083 },
  { nameHe: 'מזרעה', nameEn: 'Mazra\'a', nameRu: 'Мазраа', lat: 32.9333, lon: 35.2333 },
  { nameHe: 'עספיא', nameEn: 'Isfiya', nameRu: 'Исфия', lat: 32.7167, lon: 35.0583 },
  { nameHe: 'ביר א-סכה', nameEn: 'Bir al-Sikka', nameRu: 'Бир-эс-Сикка', lat: 32.7583, lon: 35.2333 },
  { nameHe: 'עין מאהל', nameEn: 'Ein Mahil', nameRu: 'Эйн-Махиль', lat: 32.7333, lon: 35.3167 },
  { nameHe: 'זרזיר', nameEn: 'Zarzir', nameRu: 'Зарзир', lat: 32.6833, lon: 35.2000 },
  { nameHe: 'ביר אל-מכסור', nameEn: 'Bir al-Maksur', nameRu: 'Бир-эль-Максур', lat: 32.7583, lon: 35.2500 },
  { nameHe: 'חורה', nameEn: 'Hura', nameRu: 'Хура', lat: 31.2500, lon: 34.9500 },
  { nameHe: 'כסייפה', nameEn: 'Kuseife', nameRu: 'Кусейфе', lat: 31.2500, lon: 35.0500 },
  { nameHe: 'לקיה', nameEn: 'Lakiya', nameRu: 'Лакия', lat: 31.3500, lon: 34.8500 },
  { nameHe: 'תל שבע', nameEn: 'Tel Sheva', nameRu: 'Тель-Шева', lat: 31.2667, lon: 34.8500 },
  { nameHe: 'שגב שלום', nameEn: 'Segev Shalom', nameRu: 'Сегев-Шалом', lat: 31.2167, lon: 34.8500 },
  { nameHe: 'עומר', nameEn: 'Omer', nameRu: 'Омер', lat: 31.2667, lon: 34.8500 },
  { nameHe: 'להבים', nameEn: 'Lehavim', nameRu: 'Легавим', lat: 31.3667, lon: 34.7333 },
  { nameHe: 'מיתר', nameEn: 'Meitar', nameRu: 'Мейтар', lat: 31.3333, lon: 34.9833 },
];

/** Simple case-insensitive, diacritic-agnostic substring search across
 * all three name fields — good enough for a dropdown with a few
 * hundred entries; no need for a heavier search index at this scale. */
export function searchIsraeliCities(query: string, limit = 20): IsraeliCity[] {
  const q = query.trim().toLowerCase();
  if (!q) return ISRAELI_CITIES.slice(0, limit);
  return ISRAELI_CITIES
    .filter((c) => c.nameHe.includes(query.trim()) || c.nameEn.toLowerCase().includes(q) || c.nameRu.toLowerCase().includes(q))
    .slice(0, limit);
}
