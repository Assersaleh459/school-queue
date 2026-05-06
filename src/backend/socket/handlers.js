module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_department', (dept_id) => {
      socket.join(`dept_${dept_id}`);
    });

    socket.on('join_monitor', () => {
      socket.join('public_monitor');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });
};
