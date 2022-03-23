const hre = require("hardhat");
const ethers = hre.ethers;

function assertEventEmitted(
  receipt,
  factory,
  eventName,
  callback
) {
  let found = false;

  const eventFragment = factory.interface.fragments.filter(
    (e) => e.name == eventName
  );
  const iface = new ethers.utils.Interface(eventFragment);

  for (const log in receipt.logs) {
    const topics = receipt.logs[log].topics;

    for (const index in topics) {
      const encodedTopic = topics[index];

      try {
        // CHECK IF TOPIC CORRESPONDS TO THE EVENT GIVEN TO FN
        const event = iface.getEvent(encodedTopic);

        if (event.name == eventName) {
          found = true;
          const eventArgs = iface.parseLog(receipt.logs[log]).args;
          callback(eventArgs);
        }
      } catch (e) {
        if (e.message.includes('no matching event')) continue;
        console.log('event error: ', e);
        throw new Error(e);
      }
    }
  }

  if (!found) {
    throw new Error(`Event with name ${eventName} was not emitted!`);
  }
}

exports.assertEventEmitted = assertEventEmitted;
