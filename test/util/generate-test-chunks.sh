
#!/bin/sh
# This script runs the unit tests for the project and generates chunks of tests with approximatly the same execution time in order to run them in parallel on CI
# We should run this script when we want to recalculate the chunks
TEST_FILES=$(node ./scripts/util/find-test-files.js) 
LENGTH=$(echo $TEST_FILES | jq -cM 'length')
TIME_REPORT_PATH=./time-report.txt

# Loop through all test files
for (( i=0; i<$LENGTH; i++ )); do
  TEST_FILE=$(echo $TEST_FILES | jq -cM ".[$i]" | tr -d '"') 

  # Execute each test file individually and append the `time` command output on TIME_REPORT_PATH
  { time npx hardhat test $TEST_FILE ; } 2>> $TIME_REPORT_PATH

done

# Runs the script that generates the chunks of tests
node scripts/util/split-tests-into-chunks.js 4 $TIME_REPORT_PATH $TEST_FILES

# Remove the time report file since it's no longer needed
rm $TIME_REPORT_PATH

