SHELL=/usr/bin/env bash -e -o pipefail
CI?=false

.PHONY: install
## install: install dependencies
install:
	@npm install -g aws-cdk@1.77.0
	@npm install
	@pyenv global 3.7
	@pip install awscli

.PHONY: lint
lint:
	@npm run lint	

.PHONY: test
test:
	@npm run test

.PHONY: build
## build: build stack
build:
	@npm run build	

.PHONY: bootstrap
## bootstrap: deploys the CDK toolkit stack into an AWS environment
bootstrap:
	@cdk bootstrap -c region=${AWS_DEFAULT_REGION} -c stage=${CDK_STAGE}

.PHONY: diff
## diff: compares the specified stack with the deployed stack or a local template file
diff:
	@cdk diff -c region=${AWS_DEFAULT_REGION} -c stage=${CDK_STAGE}

.PHONY: deploy
## deploy: deploy stacks
deploy:
	@# prevent ci build fail (without std output in 10 min)
	@if [ ${CI} = "true" ]; \
	then \
		while true; do echo "====[ still running ]====" ; sleep 60 ; done & \
	fi
	@cdk deploy --require-approval never -c region=${AWS_DEFAULT_REGION} -c stage=${CDK_STAGE}
