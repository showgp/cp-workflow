import { messageHandler } from './message-handler';

figma.showUI(__html__);

figma.ui.onmessage = (msg: unknown) => {
  messageHandler(msg);
};

figma.on('selectionchange', () => {
  messageHandler({ type: 'selectionchange' });
});
