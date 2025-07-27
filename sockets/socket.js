const { Server } = require('socket.io');
const AppError = require('../utils/appError');

let ioInstance;
function init(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    },
  });

  return ioInstance;
}

function getIO() {
  if (!ioInstance) {
    throw new AppError('Socket.io is not initialized');
  }
  return ioInstance;
}

module.exports = {
  init,
  getIO,
};
