const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const AppError = require('../utils/appError');
const { uploadGroupImage, deleteImages } = require('../utils/cloudinary');
const Image = require('../models/ImageModel');
const GroupSocketEvents = require('../sockets/groupSocket');

const handleImageUpload = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    if (!req.files || req.files.length === 0) {
      return next(new AppError('No images uploaded', 400));
    }

    const uploadDir = path.join(__dirname, '../public/temp/group_uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const processedImages = await Promise.all(
      req.files.map(async (file) => {
        if (!file.buffer) {
          throw new AppError(`File ${file.originalname} is corrupted`, 400);
        }

        const uniqueName = `${Date.now()}-${uuidv4()}.jpeg`;
        const outputPath = path.join(uploadDir, uniqueName);

        await sharp(file.buffer)
          .rotate()
          .toFormat('jpeg')
          .jpeg({ quality: 80 })
          .toFile(outputPath);

        const uploadResponse = await uploadGroupImage(outputPath);

        const imageObj = {
          secureURL: uploadResponse.secure_url,
          publicId: uploadResponse.public_id,
          userId,
          groupId,
        };
        const databaseResponse = await Image.create(imageObj);
        return databaseResponse;
      })
    );
    await GroupSocketEvents.emitImagesUploaded(
      groupId,
      processedImages,
      req.user
    );

    res.status(200).json({
      status: 'success',
      images: processedImages,
    });
  } catch (error) {
    return next(new AppError(error.message || 'Error processing images', 500));
  }
};

const getGroupImages = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const cursor = req.query.cursor;

    const limit = 12;
    let query = { groupId };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const totalImages = await Image.countDocuments({ groupId });

    const groupImages = await Image.find(query)
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) + 1);

    const hasMore = groupImages.length > limit;
    const imagesToReturn = hasMore ? groupImages.slice(0, limit) : groupImages;

    const nextCursor =
      imagesToReturn.length > 0
        ? imagesToReturn[imagesToReturn.length - 1].createdAt
        : null;

    res.status(200).json({
      status: 'success',
      data: {
        images: imagesToReturn,
        nextCursor,
        hasMore,
        results: imagesToReturn.length,
        totalImages,
      },
    });
  } catch (error) {
    return next(
      new AppError(error.message || 'Cannot fetch group images right now', 500)
    );
  }
};

const getImagesPostedByUser = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 9;

    let filter = { groupId };
    if (req.groupMembership.role !== 'admin') {
      filter.userId = userId;
    }

    const totalImages = await Image.countDocuments(filter);
    const userImages = await Image.find(filter)
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(totalImages / limit);

    res.status(200).json({
      status: 'success',
      data: {
        totalPages,
        results: userImages.length,
        page: parseInt(page),
        images: userImages,
      },
    });
  } catch (error) {
    return next(
      new AppError(error.message || 'Cannot fetch images posted by you', 500)
    );
  }
};

const deleteImagesPostedByUser = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { imagesId } = req.body;

    let filter = {
      groupId,
      _id: { $in: imagesId },
    };

    if (req.groupMembership.role !== 'admin') {
      filter.userId = userId;
    }

    const images = await Image.find(filter).select('publicId _id');

    if (!images.length) {
      return next(new AppError('No images found to delete', 404));
    }

    const publicIds = images.map((img) => img.publicId);
    const idsToDelete = images.map((img) => img._id);

    await Promise.all([
      deleteImages(publicIds),
      Image.deleteMany({ _id: { $in: idsToDelete } }),
    ]);

    await GroupSocketEvents.emitImagesDeleted(groupId, idsToDelete, req.user);

    res.status(200).json({
      status: 'success',
      message: 'Images deleted successfully from cloud and database',
    });
  } catch (error) {
    return next(
      new AppError(error.message || 'Cannot delete images right now', 500)
    );
  }
};

module.exports = {
  handleImageUpload,
  getGroupImages,
  getImagesPostedByUser,
  deleteImagesPostedByUser,
};
