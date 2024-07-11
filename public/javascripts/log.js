const logger = (() => {
  const logContainer = document.getElementById('logContainer');

  const customLog = (message) => {
    const logMessage = document.createElement('div');
    logMessage.textContent = message;
    logContainer.appendChild(logMessage);
  };

  // Override the default console.log function
  const originalLog = console.log;
  console.log = (message) => {
    customLog(message);
    originalLog(message); // 如果还希望在控制台中看到输出
  };

  return {
    customLog
  };
})();

export default logger;
