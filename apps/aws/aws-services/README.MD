# opscotch AWS Services App

This opscotch app provides an easy to use interface to AWS services.

Simply provide the following environment variables
- AWS_ACCOUNT : the AWS account number
- AWS_REGION : the region to access services
- AWS_SESSION_NAME : a name for your application (defaults to opscotch)
- AWS_ROLE_ARN : the role ARN to assume
- AWS_ACCESS_KEY : the access key of the user that will assume the role
- AWS_SECRET_KEY : the secret that matches the access key

The provided bootstrap can be used as is, or customized.
