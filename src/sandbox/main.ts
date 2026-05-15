import { messageHandler } from './message-handler';

figma.showUI(__html__, { width: 360, height: 600 });

figma.ui.onmessage = (msg: unknown) => {
  messageHandler(msg);
};

figma.on('selectionchange', () => {
  messageHandler({ type: 'selectionchange' });
});
