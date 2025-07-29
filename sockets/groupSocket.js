const Image = require('../models/ImageModel');
const AppError = require('../utils/appError');
const { getIO } = require('./socket');

class GroupSocketEvents {
  static async emitImagesUploaded(groupId, images, uploadedBy) {
    const totalImages = await Image.countDocuments({ groupId });

    const imagesData = images.map((image) => {
      const imageObj = image._doc ? image._doc : image;

      return {
        ...imageObj,
        userId: {
          _id: imageObj.userId,
          name: uploadedBy.name,
        },
      };
    });

    let responseObj = {};
    if (totalImages === imagesData.length) {
      responseObj = {
        images: imagesData,
        nextCursor: imagesData.at(-1)?.createdAt,
        hasMore: false,
        results: imagesData.length,
        totalImages,
      };
    } else {
      responseObj = {
        images: imagesData,
        totalImages,
      };
    }

    try {
      const io = getIO();
      io.to(groupId).emit('imagesUploaded', responseObj);
    } catch (error) {
      throw new AppError('Socket emit failed', 500);
    }
  }

  static async emitImagesDeleted(groupId, imagesDeleted, deletedBy) {
    const totalImages = await Image.countDocuments({ groupId });
    const responseObj = { totalImages, imagesDeleted, deletedBy };

    try {
      const io = getIO();
      io.to(groupId).emit('imagesDeleted', responseObj);
    } catch (error) {
      throw new AppError('Socket emit failed', 500);
    }
  }

  static emitGroupLeft(groupId, user) {
    try {
      const io = getIO();
      io.to(groupId).emit('groupLeft', {
        message: `${user.username} has left the group`,
      });
    } catch (error) {
      throw new AppError('Socket emit failed', 500);
    }
  }

  static emitGroupDelete(groupId, user) {
    try {
      const io = getIO();
      io.to(groupId).emit('groupDelete', {
        message: `Group deleted by ${user.name}`,
      });
    } catch (error) {
      throw new AppError('Socket emit failed', 500);
    }
  }
}

module.exports = GroupSocketEvents;
