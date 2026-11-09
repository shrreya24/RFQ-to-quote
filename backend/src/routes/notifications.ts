import { Router, Response } from 'express';
import { Notification } from '../models/Notification';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// GET /api/notifications
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { unreadOnly } = req.query;
    const filter: Record<string, unknown> = { userId: req.user!.id };
    if (unreadOnly === 'true') filter.isRead = false;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ userId: req.user!.id, isRead: false });

    res.json({ success: true, data: notifications, unreadCount });
  })
);

// PATCH /api/notifications/:id/read
router.patch(
  '/:id/read',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.json({ success: true, notification });
  })
);

// PATCH /api/notifications/read-all
router.patch(
  '/read-all',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await Notification.updateMany({ userId: req.user!.id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  })
);

export default router;
