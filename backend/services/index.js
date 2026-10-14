// Simple import test for ContextService and BriefingService
// This file is just to verify the services can be imported correctly
// Actual testing with mocks is in the .test.js files

const ContextService = require('./ContextService');
const BriefingService = require('./BriefingService');

console.log('Services imported successfully');
console.log('ContextService:', typeof ContextService === 'object' && ContextService !== null);
console.log('BriefingService:', typeof BriefingService === 'object' && BriefingService !== null);

// Export for use in other files if needed
module.exports = {
  ContextService,
  BriefingService
};