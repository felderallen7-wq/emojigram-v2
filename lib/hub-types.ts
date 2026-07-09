export type PresenceMember = { userId: string; displayName: string; avatarEmoji: string };

export type BroadcastMessage = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  originalText: string;
  createdAt: string;
};

export type RoomEvent =
  | { type: 'message'; message: BroadcastMessage }
  | { type: 'presence'; members: PresenceMember[] };

export type Subscriber = (event: RoomEvent) => void;
export type Leave = () => Promise<void>;
