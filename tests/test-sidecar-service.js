const sidecarManager = require('../src/main/services/sidecar-manager');

async function run() {
  console.log('Testing sidecarManager service...');
  try {
    const hw = await sidecarManager.start();
    console.log('Start OK! Hardware detected:', hw);

    const ping = await sidecarManager.ping();
    console.log('Ping response:', ping);

    const voices = await sidecarManager.listVoices();
    console.log(`Voices response: ${voices.length} voices found.`);

    console.log('Testing clean shutdown...');
    sidecarManager.shutdown();
    console.log('All Sidecar tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Sidecar test error:', err);
    sidecarManager.shutdown();
    process.exit(1);
  }
}

run();
