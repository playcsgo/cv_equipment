const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const { engine } = require('express-handlebars');
const routes = require('./routes');
const methodOverride = require('method-override');
const hbsHelpers = require('./hbsHelpers.js');
const session = require('express-session');
const usePassport = require('./config/passport');
const flash = require('connect-flash');

// redis for session
const RedisStore = require('connect-redis').default;
const Redis = require('ioredis');
const redisClient = new Redis({
  host: 'localhost',
  port: 6379,
});

// websoket server for pm2 log
const http = require('http');
const socketIo = require('socket.io');
const pm2 = require('pm2');
const server = http.createServer(app);
const io = socketIo(server);

io.on('connection', (socket) => {
  console.log('New client connected');

  // for pm2 log
  pm2.launchBus((err, bus) => {
    if (err) {
      console.error('Error launching PM2 bus:', err);
      return;
    }

    bus.on('log:out', (data) => {
      socket.emit('log', data.data);
    });

    bus.on('log:err', (data) => {
      socket.emit('log', data.data);
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

require('dotenv').config();
require('./config/mongoose');

app.engine('hbs', engine({ extname: 'hbs', defaultLayout: 'main', helpers: hbsHelpers }));
app.set('view engine', 'hbs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
  store: new RedisStore({ client: redisClient }), // session in Redis
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());
usePassport(app);
app.use((req, res, next) => {
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.user = req.user;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.warning_msg = req.flash('warning_msg');
  next();
});

app.use(routes);

server.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
});
