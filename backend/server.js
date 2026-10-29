require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const routes = require('./src/routes');
const errorMiddleware = require('./src/middlewares/error.middleware');
const chatHandler = require('./src/sockets/chatHandler');
const socketInstance = require('./src/sockets/socketInstance');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use(errorMiddleware);

socketInstance.init(io); // lưu io lại để dùng ở các Service khác (gửi thông báo)
chatHandler(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));