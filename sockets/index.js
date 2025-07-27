const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const UserGroupMembership = require('../models/userGroupMembershipModel');

const superSockets = (io) => {
  io.use(async (socket, next) => {
    const rawCookies = socket.handshake.headers.cookie;
    if (!rawCookies) return next(new AppError('Cookies not found', 401));

    const cookies = cookie.parse(rawCookies);
    const authCookie = cookies['jwt'];

    if (!authCookie)
      return next(new AppError('Please login to get access', 401));

    const { groupId } = socket.handshake.auth;
    if (!groupId)
      return next(new AppError('Please provide valid groupId', 404));

    try {
      const decoded = jwt.verify(authCookie, process.env.JWT_SECRET);
      const userId = decoded.id;
      const user = await User.findById(userId);

      const isMember = await UserGroupMembership.findOne({ groupId, userId });
      if (!isMember)
        return next(
          new AppError(
            'You are not authorized to access this group resource',
            403
          )
        );

      if (!user) return next(new AppError('User not found', 401));
      socket.user = user;
      socket.groupId = groupId;
      next();
    } catch (error) {
      return next(new AppError('Invalid Token', 401));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.groupId);
  });
};

module.exports = { superSockets };
