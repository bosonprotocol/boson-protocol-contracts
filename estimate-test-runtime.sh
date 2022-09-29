
#!/bin/sh
# This script run the unit tests for the project and generate a time report of each test file

TEST_FILES=$(node ./scripts/util/find-test-files.js) 
LENGTH=$(echo $TEST_FILES | jq -cM 'length')
TIME_REPORT_PATH=./time-report.txt

for (( i=0; i<$LENGTH; i++ )); do
  TEST_FILE=$(echo $TEST_FILES | jq -cM ".[$i]" | tr -d '"') 
    
  { time npx hardhat test $TEST_FILE ; } 2>> $TIME_REPORT_PATH

done

node scripts/util/estimate-test-chunk-time.js 3 $TIME_REPORT_PATH $TEST_FILES



