const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// SQLite Database Setup
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    isAdmin BOOLEAN DEFAULT 0
  )`);

  // Products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    unit TEXT,
    image TEXT,
    isActive BOOLEAN DEFAULT 1
  )`);

  // Orders table
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    customerName TEXT,
    customerPhone TEXT,
    address TEXT,
    comment TEXT,
    paymentMethod TEXT,
    latitude REAL,
    longitude REAL,
    total REAL,
    status TEXT DEFAULT 'new',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    items JSON,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Reviews table
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER,
    productId INTEGER,
    customerName TEXT,
    rating INTEGER,
    comment TEXT,
    date TEXT,
    approved BOOLEAN DEFAULT 0
  )`);
});

// Database wrapper for async/await
const dbAsync = {
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  })
};

// Seed initial products if empty
async function seedProducts() {
  const row = await dbAsync.get('SELECT COUNT(*) as count FROM products');
  if (row.count === 0) {
    const initialProducts = [
      ['Мёд липовый', 'Натуральный липовый мёд из окрестностей Самарканда.', 60000, 'за 1 кг', '/images/linden-honey.jpg', 1],
      ['Мёд акациевый', 'Светлый и нежный мёд из акации, подходит для детей.', 70000, 'за 1 кг', '/images/acacia-honey.jpg', 1],
      ['Пыльца (обножка)', 'Натуральная пчелиная пыльца — источник витаминов.', 50000, 'за 300 г', '/images/pollen.jpg', 1]
    ];
    for (const p of initialProducts) {
      await dbAsync.run('INSERT INTO products (name, description, price, unit, image, isActive) VALUES (?, ?, ?, ?, ?, ?)', p);
    }
  }
}

// Simple i18n
const SUPPORTED_LANGS = ['ru', 'uz', 'en'];
const DEFAULT_LANG = 'ru';

const translations = {
  ru: {
    nav: {
      catalog: 'Каталог',
      cart: 'Корзина',
      admin: 'Админ',
      login: 'Вход',
      register: 'Регистрация',
      logout: 'Выйти'
    },
    home: {
      title: 'Магазин домашнего мёда',
      subtitle:
        'Натуральный мёд и продукты пчеловодства с пасек возле Самарканда. Без сахара, без добавок — только настоящий вкус.',
      deliveryTitle: 'Доставка по Самарканду',
      deliveryItems: [
        'Доставка курьером по городу',
        'Оплата наличными при получении',
        'Аккуратная упаковка и свежий мёд'
      ],
      emptyProducts: 'Товары пока не добавлены.',
      addToCart: 'В корзину'
    },
    cart: {
      title: 'Корзина',
      subtitle: 'Проверьте заказ перед оформлением.',
      empty: 'Ваша корзина пуста. Перейдите в каталог и добавьте мёд.',
      goCatalog: 'Перейти в каталог',
      headers: {
        product: 'Товар',
        price: 'Цена',
        qty: 'Кол-во',
        sum: 'Сумма'
      },
      total: 'Итого',
      continue: 'Продолжить покупки',
      checkout: 'Оформить заказ',
      remove: 'Удалить'
    },
    auth: {
      loginTitle: 'Вход в аккаунт',
      loginSubtitle: 'Авторизуйтесь, чтобы оформить заказ быстрее.',
      registerTitle: 'Регистрация',
      registerSubtitle: 'Создайте аккаунт, чтобы удобнее оформлять заказы.',
      email: 'Email',
      password: 'Пароль',
      name: 'Имя',
      phone: 'Телефон',
      loginButton: 'Войти',
      registerButton: 'Зарегистрироваться',
      noAccount: 'Нет аккаунта?',
      haveAccount: 'Уже есть аккаунт?',
      toRegister: 'Зарегистрироваться',
      toLogin: 'Войти',
      passwordHint: 'Минимум 6 символов.'
    },
    checkout: {
      title: 'Оформление заказа',
      subtitle: 'Укажите адрес доставки и подтвердите заказ.',
      addressLabel: 'Адрес доставки',
      addressHint:
        'Укажите город (Самарканд), улицу, дом, подъезд, ориентир.',
      commentLabel: 'Комментарий к заказу (необязательно)',
      paymentLabel: 'Способ оплаты',
      paymentCash: 'Наличными при получении',
      paymentHint: 'Другие способы оплаты пока недоступны.',
      mapLabel: 'Точка на карте (по желанию)',
      mapHint:
        'Кликните по карте, чтобы отметить дом или место встречи курьера в Самарканде.',
      submit: 'Подтвердить заказ',
      summaryTitle: 'Ваш заказ'
    },
    order: {
      successTitle: 'Спасибо за заказ!',
      successSubtitle: 'Мы свяжемся с вами по телефону для подтверждения и уточнения времени доставки.',
      orderNumber: 'Заказ №',
      openInMaps: 'открыть в картах',
      orderContents: 'Состав заказа',
      totalToPay: 'Итого к оплате',
      backToCatalog: 'Вернуться в каталог'
    },
    reviews: {
      title: 'Отзывы',
      leaveReview: 'Оставить отзыв',
      yourRating: 'Ваша оценка',
      comment: 'Комментарий',
      submitReview: 'Отправить отзыв',
      reviewSuccess: 'Спасибо за отзыв!',
      reviewPending: 'Ваш отзыв отправлен на модерацию',
      averageRating: 'Средний рейтинг',
      totalReviews: 'всего отзывов',
      noReviews: 'Пока нет отзывов',
      filterByRating: 'Фильтр по оценке',
      allRatings: 'Все оценки',
      fiveStars: '5 звезд',
      fourStars: '4 звезды',
      threeStars: '3 звезды',
      twoStars: '2 звезды',
      oneStar: '1 звезда'
    }
  },
  uz: {
    nav: {
      catalog: 'Katalog',
      cart: 'Savat',
      admin: 'Admin',
      login: 'Kirish',
      register: 'Ro‘yxatdan o‘tish',
      logout: 'Chiqish'
    },
    home: {
      title: 'Uy asali do‘koni',
      subtitle:
        'Samarqand atrofidagi pasikalardan olingan tabiiy asal va asalarichilik mahsulotlari.',
      deliveryTitle: 'Samarqand bo‘ylab yetkazib berish',
      deliveryItems: [
        'Shahar bo‘ylab kuryer yetkazib berishi',
        'Qabul qilishda naqd to‘lov',
        'Ehtiyotkor o‘rash va yangi asal'
      ],
      emptyProducts: 'Mahsulotlar hali qo‘shilmagan.',
      addToCart: 'Savatchaga'
    },
    cart: {
      title: 'Savat',
      subtitle: 'Buyurtmani rasmiylashtirishdan oldin tekshiring.',
      empty: 'Savatchingiz bo‘sh. Katalogga o‘ting va asal qo‘shing.',
      goCatalog: 'Katalogga o‘tish',
      headers: {
        product: 'Mahsulot',
        price: 'Narx',
        qty: 'Soni',
        sum: 'Jami'
      },
      total: 'Jami',
      continue: 'Xaridlarni davom ettirish',
      checkout: 'Buyurtma berish',
      remove: 'O‘chirish'
    },
    auth: {
      loginTitle: 'Akkauntga kirish',
      loginSubtitle: 'Tezroq buyurtma berish uchun kiring.',
      registerTitle: 'Ro‘yxatdan o‘tish',
      registerSubtitle:
        'Buyurtmalarni qulayroq rasmiylashtirish uchun akkaunt yarating.',
      email: 'Email',
      password: 'Parol',
      name: 'Ism',
      phone: 'Telefon',
      loginButton: 'Kirish',
      registerButton: 'Ro‘yxatdan o‘tish',
      noAccount: 'Akkauntingiz yo‘qmi?',
      haveAccount: 'Allaqachon akkauntingiz bormi?',
      toRegister: 'Ro‘yxatdan o‘tish',
      toLogin: 'Kirish',
      passwordHint: 'Kamida 6 ta belgi.'
    },
    checkout: {
      title: 'Buyurtmani rasmiylashtirish',
      subtitle: 'Yetkazib berish manzilini kiriting va buyurtmani tasdiqlang.',
      addressLabel: 'Yetkazib berish manzili',
      addressHint:
        'Shahar (Samarqand), ko‘cha, uy, bino, yo‘nalish ko‘rsatkichi.',
      commentLabel: 'Izoh (majburiy emas)',
      paymentLabel: 'To‘lov usuli',
      paymentCash: 'Qabul qilishda naqd',
      paymentHint: 'Hozircha faqat naqd to‘lov mavjud.',
      mapLabel: 'Xaritada nuqta (ixtiyoriy)',
      mapHint:
        'Kuryer uchrashadigan joy yoki uyni ko‘rsatish uchun xaritada bosing.',
      submit: 'Buyurtmani tasdiqlash',
      summaryTitle: 'Sizning buyurtmangiz'
    },
    order: {
      successTitle: 'Buyurtma uchun rahmat!',
      successSubtitle: 'Tasdiqlash va yetkazib berish vaqtini aniqlash uchun sizga telefon qilamiz.',
      orderNumber: 'Buyurtma №',
      openInMaps: 'xaritada ochish',
      orderContents: 'Buyurtma tarkibi',
      totalToPay: 'Jami to‘lov',
      backToCatalog: 'Katalogga qaytish'
    },
    reviews: {
      title: 'Sharhlar',
      leaveReview: 'Sharh qoldirish',
      yourRating: 'Sizning baholang',
      comment: 'Izoh',
      submitReview: 'Sharhni yuborish',
      reviewSuccess: 'Sharh uchun rahmat!',
      reviewPending: 'Sizning sharhingiz moderatsiyaga yuborildi',
      averageRating: "O'rtacha reyting",
      totalReviews: 'jami sharhlar',
      noReviews: 'Hozircha sharhlar yo\'q',
      filterByRating: 'Baho bo\'yicha filter',
      allRatings: 'Barcha baholar',
      fiveStars: '5 yulduz',
      fourStars: '4 yulduz',
      threeStars: '3 yulduz',
      twoStars: '2 yulduz',
      oneStar: '1 yulduz'
    }
  },
  en: {
    nav: {
      catalog: 'Catalog',
      cart: 'Cart',
      admin: 'Admin',
      login: 'Log in',
      register: 'Sign up',
      logout: 'Log out'
    },
    home: {
      title: 'Home Honey Shop',
      subtitle:
        'Natural honey and beekeeping products from apiaries around Samarkand.',
      deliveryTitle: 'Delivery in Samarkand',
      deliveryItems: [
        'Courier delivery across the city',
        'Cash payment on delivery',
        'Careful packaging and fresh honey'
      ],
      emptyProducts: 'No products have been added yet.',
      addToCart: 'Add to cart'
    },
    cart: {
      title: 'Cart',
      subtitle: 'Review your order before checkout.',
      empty: 'Your cart is empty. Go to catalog and add some honey.',
      goCatalog: 'Go to catalog',
      headers: {
        product: 'Product',
        price: 'Price',
        qty: 'Qty',
        sum: 'Total'
      },
      total: 'Total',
      continue: 'Continue shopping',
      checkout: 'Checkout',
      remove: 'Remove'
    },
    auth: {
      loginTitle: 'Log in',
      loginSubtitle: 'Log in to place orders faster.',
      registerTitle: 'Sign up',
      registerSubtitle: 'Create an account for more convenient checkout.',
      email: 'Email',
      password: 'Password',
      name: 'Name',
      phone: 'Phone',
      loginButton: 'Log in',
      registerButton: 'Sign up',
      noAccount: 'No account?',
      haveAccount: 'Already have an account?',
      toRegister: 'Sign up',
      toLogin: 'Log in',
      passwordHint: 'At least 6 characters.'
    },
    checkout: {
      title: 'Checkout',
      subtitle: 'Enter the delivery address and confirm your order.',
      addressLabel: 'Delivery address',
      addressHint:
        'Specify city (Samarkand), street, house, entrance, and landmark.',
      commentLabel: 'Order comment (optional)',
      paymentLabel: 'Payment method',
      paymentCash: 'Cash on delivery',
      paymentHint: 'Other payment methods are not available yet.',
      mapLabel: 'Point on map (optional)',
      mapHint:
        'Click on the map to mark the house or meeting point for the courier.',
      submit: 'Confirm order',
      summaryTitle: 'Your order'
    },
    order: {
      successTitle: 'Thank you for your order!',
      successSubtitle: 'We will contact you by phone to confirm and clarify the delivery time.',
      orderNumber: 'Order #',
      openInMaps: 'open in maps',
      orderContents: 'Order contents',
      totalToPay: 'Total to pay',
      backToCatalog: 'Back to catalog'
    },
    reviews: {
      title: 'Reviews',
      leaveReview: 'Leave a review',
      yourRating: 'Your rating',
      comment: 'Comment',
      submitReview: 'Submit review',
      reviewSuccess: 'Thank you for your review!',
      reviewPending: 'Your review has been sent for moderation',
      averageRating: 'Average rating',
      totalReviews: 'total reviews',
      noReviews: 'No reviews yet',
      filterByRating: 'Filter by rating',
      allRatings: 'All ratings',
      fiveStars: '5 stars',
      fourStars: '4 stars',
      threeStars: '3 stars',
      twoStars: '2 stars',
      oneStar: '1 star'
    }
  }
};

// File uploads (product images)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, unique + ext.toLowerCase());
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Можно загружать только изображения'));
    }
    cb(null, true);
  }
});

// Session & middlewares
app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: './'
    }),
    secret: process.env.SESSION_SECRET || 'asalchi-amin-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4 // 4 часа
    }
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Language middleware
app.use((req, res, next) => {
  let lang = req.query.lang || req.session.lang || DEFAULT_LANG;
  if (!SUPPORTED_LANGS.includes(lang)) {
    lang = DEFAULT_LANG;
  }
  req.session.lang = lang;
  res.locals.currentLang = lang;
  res.locals.langs = SUPPORTED_LANGS;

  const dict = translations[lang] || translations[DEFAULT_LANG];
  res.locals.t = (key) => {
    const parts = key.split('.');
    let value = dict;
    for (const p of parts) {
      if (value && Object.prototype.hasOwnProperty.call(value, p)) {
        value = value[p];
      } else {
        return key;
      }
    }
    return value;
  };
  next();
});

// Helpers
function ensureCart(req) {
  if (!req.session.cart) {
    req.session.cart = [];
  }
}

function getCartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).send('Доступ запрещён');
  }
  next();
}

// Create demo admin user
async function createDemoAdmin() {
  const existingAdmin = await dbAsync.get('SELECT * FROM users WHERE email = ?', ['admin@asalchi.uz']);
  if (!existingAdmin) {
    const hash = await bcrypt.hash('admin123', 10);
    await dbAsync.run(
      'INSERT INTO users (name, email, phone, passwordHash, isAdmin) VALUES (?, ?, ?, ?, ?)',
      ['Администратор', 'admin@asalchi.uz', '+998', hash, 1]
    );
  }
}

// Inject globals into templates
app.use((req, res, next) => {
  ensureCart(req);
  res.locals.currentUser = req.session.user || null;
  res.locals.cartCount = req.session.cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  res.locals.cartTotal = getCartTotal(req.session.cart);
  next();
});

// ROUTES

// Главная — каталог
app.get('/', async (req, res) => {
  const { search } = req.query;
  let products;
  
  if (search) {
    const query = `%${search.toLowerCase()}%`;
    products = await dbAsync.all(
      'SELECT * FROM products WHERE isActive = 1 AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)',
      [query, query]
    );
  } else {
    products = await dbAsync.all('SELECT * FROM products WHERE isActive = 1');
  }

  const approvedReviews = await dbAsync.all('SELECT * FROM reviews WHERE approved = 1');
  res.render('index', { 
    title: 'Каталог мёда', 
    products,
    reviews: approvedReviews,
    searchQuery: search || ''
  });
});

// Корзина
app.get('/cart', (req, res) => {
  res.render('cart', {
    title: 'Корзина',
    cart: req.session.cart,
    total: getCartTotal(req.session.cart)
  });
});

app.post('/cart/add/:id', async (req, res) => {
  ensureCart(req);
  const productId = Number(req.params.id);
  const quantity = Number(req.body.quantity) || 1;
  
  const product = await dbAsync.get('SELECT * FROM products WHERE id = ? AND isActive = 1', [productId]);
  if (!product) {
    return res.redirect('/');
  }
  const existing = req.session.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    req.session.cart.push({
      productId,
      name: product.name,
      price: product.price,
      quantity
    });
  }
  res.redirect('/cart');
});

app.post('/cart/update/:id', (req, res) => {
  ensureCart(req);
  const productId = Number(req.params.id);
  const quantity = Math.max(1, Number(req.body.quantity) || 1);
  const item = req.session.cart.find((i) => i.productId === productId);
  if (item) {
    item.quantity = quantity;
  }
  res.redirect('/cart');
});

app.post('/cart/remove/:id', (req, res) => {
  ensureCart(req);
  const productId = Number(req.params.id);
  req.session.cart = req.session.cart.filter(
    (i) => i.productId !== productId
  );
  res.redirect('/cart');
});

// Регистрация
app.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Регистрация', error: null, values: {} });
});

app.post('/register', async (req, res) => {
  const { name, phone, email, password } = req.body;
  const values = { name, phone, email };
  
  if (!name || !phone || !password) {
    return res.render('auth/register', {
      title: 'Регистрация',
      error: 'Заполните обязательные поля (имя, телефон, пароль)',
      values
    });
  }
  
  // Проверка уникальности телефона
  const existingByPhone = await dbAsync.get('SELECT * FROM users WHERE phone = ?', [phone]);
  if (existingByPhone) {
    return res.render('auth/register', {
      title: 'Регистрация',
      error: 'Пользователь с таким телефоном уже существует',
      values
    });
  }
  
  // Проверка уникальности email (если указан)
  if (email) {
    const existingByEmail = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingByEmail) {
      return res.render('auth/register', {
        title: 'Регистрация',
        error: 'Пользователь с таким email уже существует',
        values
      });
    }
  }
  
  const hash = await bcrypt.hash(password, 10);
  const result = await dbAsync.run(
    'INSERT INTO users (name, phone, email, passwordHash, isAdmin) VALUES (?, ?, ?, ?, ?)',
    [name, phone, email || null, hash, 0]
  );
  
  req.session.user = {
    id: result.id,
    name,
    email: email || null,
    phone,
    isAdmin: false
  };
  res.redirect('/');
});

// Вход
app.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Вход в аккаунт', error: null, values: {} });
});

app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  const values = { login };
  
  if (!login || !password) {
    return res.render('auth/login', {
      title: 'Вход в аккаунт',
      error: 'Заполните все поля',
      values
    });
  }
  
  // Ищем пользователя по телефону или email
  const user = await dbAsync.get('SELECT * FROM users WHERE phone = ? OR email = ?', [login, login]);
  
  if (!user) {
    return res.render('auth/login', {
      title: 'Вход в аккаунт',
      error: 'Пользователь с таким телефоном или email не найден',
      values
    });
  }
  
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.render('auth/login', {
      title: 'Вход в аккаунт',
      error: 'Неверный пароль',
      values
    });
  }
  
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isAdmin: user.isAdmin
  };
  res.redirect('/');
});

// Выход
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Оформление заказа
app.get('/checkout', requireAuth, (req, res) => {
  ensureCart(req);
  if (!req.session.cart.length) {
    return res.redirect('/cart');
  }
  res.render('checkout', {
    title: 'Оформление заказа',
    cart: req.session.cart,
    total: getCartTotal(req.session.cart),
    error: null,
    values: {}
  });
});

app.post('/checkout', requireAuth, async (req, res) => {
  ensureCart(req);
  if (!req.session.cart.length) {
    return res.redirect('/cart');
  }
  const { address, comment, paymentMethod, latitude, longitude } = req.body;
  const values = { address, comment, paymentMethod, latitude, longitude };
  if (!address || !paymentMethod) {
    return res.render('checkout', {
      title: 'Оформление заказа',
      cart: req.session.cart,
      total: getCartTotal(req.session.cart),
      error: 'Укажите адрес и способ оплаты',
      values
    });
  }
  if (paymentMethod !== 'cash') {
    return res.render('checkout', {
      title: 'Оформление заказа',
      cart: req.session.cart,
      total: getCartTotal(req.session.cart),
      error: 'Сейчас доступна только оплата наличными при получении',
      values
    });
  }

  const user = req.session.user;
  const itemsJson = JSON.stringify(req.session.cart);
  const total = getCartTotal(req.session.cart);

  const result = await dbAsync.run(
    `INSERT INTO orders (userId, customerName, customerPhone, address, comment, paymentMethod, latitude, longitude, total, items) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id, 
      user.name, 
      user.phone, 
      address, 
      comment || '', 
      paymentMethod, 
      latitude ? Number(latitude) : null, 
      longitude ? Number(longitude) : null, 
      total, 
      itemsJson
    ]
  );

  req.session.cart = [];
  res.redirect(`/order-success/${result.id}`);
});

// Страница успешного заказа
app.get('/order-success/:id', requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  const order = await dbAsync.get('SELECT * FROM orders WHERE id = ? AND userId = ?', [orderId, req.session.user.id]);
  
  if (!order) {
    return res.redirect('/');
  }
  
  // Parse JSON items
  order.items = JSON.parse(order.items);
  
  res.render('order-success', {
    title: 'Заказ оформлен',
    order
  });
});

// Личный кабинет - заказы пользователя
app.get('/my-orders', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const orders = await dbAsync.all('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC', [userId]);
  
  // Parse items for each order
  orders.forEach(o => {
    try {
      o.items = JSON.parse(o.items);
    } catch (e) {
      o.items = [];
    }
  });

  res.render('my-orders', {
    title: 'Мои заказы',
    orders
  });
});

// Админ-панель
app.get('/admin', requireAdmin, async (req, res) => {
  const products = await dbAsync.all('SELECT * FROM products');
  const orders = await dbAsync.all('SELECT * FROM orders ORDER BY createdAt DESC');
  
  // Parse items for each order
  orders.forEach(o => {
    try {
      o.items = JSON.parse(o.items);
    } catch (e) {
      o.items = [];
    }
  });

  res.render('admin/dashboard', {
    title: 'Админ-панель',
    products,
    orders
  });
});

// Создание товара
app.get('/admin/products/new', requireAdmin, (req, res) => {
  res.render('admin/product-form', {
    title: 'Новый товар',
    product: null,
    error: null
  });
});

app.post('/admin/products', requireAdmin, upload.single('imageFile'), async (req, res) => {
  const { name, description, price, unit, isActive } = req.body;
  if (!name || !price) {
    return res.render('admin/product-form', {
      title: 'Новый товар',
      product: null,
      error: 'Название и цена обязательны'
    });
  }
  let imagePath = '';
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  await dbAsync.run(
    'INSERT INTO products (name, description, price, unit, image, isActive) VALUES (?, ?, ?, ?, ?, ?)',
    [name, description, price, unit || '', imagePath, isActive ? 1 : 0]
  );
  res.redirect('/admin');
});

// Редактирование товара
app.get('/admin/products/:id/edit', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) {
    return res.redirect('/admin');
  }
  res.render('admin/product-form', {
    title: 'Редактирование товара',
    product,
    error: null
  });
});

app.post('/admin/products/:id', requireAdmin, upload.single('imageFile'), async (req, res) => {
  const id = Number(req.params.id);
  const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) {
    return res.redirect('/admin');
  }
  const { name, description, price, unit, isActive } = req.body;
  if (!name || !price) {
    return res.render('admin/product-form', {
      title: 'Редактирование товара',
      product,
      error: 'Название и цена обязательны'
    });
  }
  
  let imagePath = product.image;
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  await dbAsync.run(
    'UPDATE products SET name = ?, description = ?, price = ?, unit = ?, image = ?, isActive = ? WHERE id = ?',
    [name, description, Number(price), unit || '', imagePath, isActive ? 1 : 0, id]
  );
  res.redirect('/admin');
});

// Удаление товара
app.post('/admin/products/:id/delete', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await dbAsync.run('DELETE FROM products WHERE id = ?', [id]);
  res.redirect('/admin');
});

// Обновление статуса заказа
app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  await dbAsync.run('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  res.redirect('/admin');
});

// Отзывы
app.get('/reviews', async (req, res) => {
  const productReviews = await dbAsync.all('SELECT * FROM reviews WHERE approved = 1');
  const products = await dbAsync.all('SELECT * FROM products');
  const reviewsByProduct = {};
  
  productReviews.forEach(review => {
    if (!reviewsByProduct[review.productId]) {
      reviewsByProduct[review.productId] = [];
    }
    reviewsByProduct[review.productId].push(review);
  });
  
  res.render('reviews', {
    title: 'Отзывы',
    reviews: productReviews,
    reviewsByProduct,
    products
  });
});

app.post('/reviews', async (req, res) => {
  const { orderId, productId, rating, comment, customerName } = req.body;
  
  if (!orderId || !productId || !rating || !customerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const date = new Date().toISOString().split('T')[0];
  
  await dbAsync.run(
    'INSERT INTO reviews (orderId, productId, customerName, rating, comment, date, approved) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [Number(orderId), Number(productId), customerName, Number(rating), comment || '', date, 0]
  );
  
  res.json({ 
    success: true, 
    message: 'Ваш отзыв отправлен на модерацию'
  });
});

// Админ-панель - управление отзывами
app.get('/admin/reviews', requireAdmin, async (req, res) => {
  const pendingReviews = await dbAsync.all('SELECT * FROM reviews WHERE approved = 0');
  const approvedReviews = await dbAsync.all('SELECT * FROM reviews WHERE approved = 1');
  const products = await dbAsync.all('SELECT * FROM products');
  
  res.render('admin/reviews', {
    title: 'Управление отзывами',
    pendingReviews,
    approvedReviews,
    products
  });
});

app.post('/admin/reviews/:id/approve', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await dbAsync.run('UPDATE reviews SET approved = 1 WHERE id = ?', [id]);
  res.redirect('/admin/reviews');
});

app.post('/admin/reviews/:id/delete', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await dbAsync.run('DELETE FROM reviews WHERE id = ?', [id]);
  res.redirect('/admin/reviews');
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Страница не найдена' });
});

// Error handler for multer and other errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send('Файл слишком большой. Максимальный размер: 5 МБ');
    }
    return res.status(400).send('Ошибка загрузки файла: ' + err.message);
  }
  if (err) {
    console.error(err);
    return res.status(500).send('Произошла ошибка: ' + err.message);
  }
  next();
});

Promise.all([createDemoAdmin(), seedProducts()]).then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Asalchi Amin запущен на http://localhost:${PORT}`);
    console.log(`Для доступа с телефона: http://[IP-адрес]:${PORT}`);
  });
});

