const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const { Email } = require('../utils/email');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET);
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return next(new AppError('Please provide username and password', 400));
    }

    const user = await User.findOne({ username });
    if (!user) {
      return next(
        new AppError('No account exists with the provided username', 401)
      );
    } else if (user.authProvider === 'google') {
      return next(
        new AppError(
          'This account is already linked with google, Try logging using google',
          401
        )
      );
    }

    if (!(await user.verifyPassword(password, user.password))) {
      return next(new AppError('Incorrect username or password', 401));
    }

    const token = createToken(user.id);
    res.cookie('jwt', token, {
      secure: true,
      httpOnly: true,
      sameSite: 'None',
    });

    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (err) {
    next(new AppError(err.message, 400));
  }
};

const register = async (req, res, next) => {
  try {
    const newUser = await User.create(req.body);
    const url = `${process.env.FRONTEND_URL}/user`;
    await new Email(newUser, url).sendWelcome();
    const user = newUser.toJSON();

    const token = createToken(user.id);
    res.cookie('jwt', token, {
      secure: true,
      httpOnly: true,
      sameSite: 'None',
    });

    res.status(201).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (err) {
    next(new AppError(err.message, 400));
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { username, email } = req.body;
    const user = await User.findOne({ email, username });

    if (user.authProvider === 'google')
      return next(
        new AppError(
          'This account is already logged in using google, you cant reset its password'
        )
      );

    if (!user)
      return next(
        new AppError('Cant find a user with the given username and password')
      );
    const token = await user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      const url = `${process.env.FRONTEND_URL}/reset-password/${token}`;
      await new Email(user, url).sendPasswordReset();

      res.status(200).json({
        status: 'success',
        message:
          'Password change email has been sent to the provided email address',
      });
    } catch (error) {
      user.passwordResetExpires = undefined;
      user.passwordResetToken = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError(
          'An error occured while sending email, please try again later',
          500
        )
      );
    }
  } catch (error) {
    return next(new AppError(error.message, 400));
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user)
      return next(
        new AppError('Your token is expired please try again later', 401)
      );

    user.password = req.body.password;
    user.confirmPassword = req.body.confirmPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(201).json({
      status: 'success',
      message: 'Your password has been successfully updated',
    });
  } catch (error) {
    next(new AppError(error.message, 400));
  }
};

const verifyUser = async (req, res, next) => {
  try {
    res.status(201).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(new AppError(error.message, 400));
  }
};

const googleLogin = async (req, res, next) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: req.body.token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const existingUser = await User.findOne({ email: payload.email });
    let user;

    if (!existingUser) {
      const truncatedGivenName = payload.given_name.substring(0, 6);
      const username = truncatedGivenName.toLowerCase() + payload.sub;
      const url = `${process.env.FRONTEND_URL}/user`;

      user = await User.create({
        name: payload.name,
        username,
        email: payload.email,
        authProvider: 'google',
        googleId: payload.sub,
        profilePhoto: {
          url: payload.picture,
          publicId: '',
        },
      });
      await new Email(user, url).sendWelcome();
    } else if (existingUser.authProvider === 'local') {
      existingUser.authProvider = 'both';
      existingUser.googleId = payload.sub;

      if (existingUser.profilePhoto.publicId === 'ebtyc00ucwiurvnemsbm') {
        existingUser.profilePhoto.publicId = '';
        existingUser.profilePhoto.url = payload.picture;
      }
      await existingUser.save();
      user = existingUser;
    } else {
      user = existingUser;
    }

    const token = createToken(user.id);
    res.cookie('jwt', token, {
      secure: true,
      httpOnly: true,
      sameSite: 'None',
    });

    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (error) {
    next(new AppError(error.message, 400));
  }
};

module.exports = {
  register,
  login,
  verifyUser,
  googleLogin,
  forgotPassword,
  resetPassword,
};
