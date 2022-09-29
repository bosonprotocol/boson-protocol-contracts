
#!/bin/sh
# This script run the unit tests for the project and generat chunks of tests with approximatly the same execution time in order to run them in parallel on CI
TEST_FILES=$(node ./scripts/util/find-test-files.js) 
LENGTH=$(echo $TEST_FILES | jq -cM 'length')
TIME_REPORT_PATH=./time-report.txt

# for (( i=0; i<$LENGTH; i++ )); do
#   TEST_FILE=$(echo $TEST_FILES | jq -cM ".[$i]" | tr -d '"') 
#     
#   { time npx hardhat test $TEST_FILE ; } 2>> $TIME_REPORT_PATH

# done

node scripts/util/split-tests-into-chunks.js 4 $TIME_REPORT_PATH $TEST_FILES

# rm $TIME_REPORT_PATH

