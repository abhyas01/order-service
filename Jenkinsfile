@Library('ecommerce-shared-lib') _

pipeline {
  agent any

  tools { nodejs 'node-20' }

  environment {
    SERVICE_NAME  = 'order-service'
    IMAGE_NAME    = '01abhyas/order-service'
    SONAR_PROJECT = 'ecommerce-order-service'
  }

  stages {

    stage('Prepare Version') {
      steps {
        script {
          def ver         = prepareVersion(packageJsonPath: 'src/package.json')
          env.DOCKER_TAG  = ver.DOCKER_TAG
          env.BRANCH_SAFE = ver.BRANCH_SAFE
        }
      }
    }

    stage('Install Dependencies') {
      steps {
        dir('src') { sh 'npm install' }
      }
    }

    stage('Lint') {
      steps {
        dir('src') { sh 'npm run lint' }
      }
    }
    
    stage('Unit Test') {
      steps {
        dir('src') { sh 'npm run test:unit' }
      }
      post {
        always {
          junit testResults: 'src/coverage/junit.xml', allowEmptyResults: true
        }
      }
    }

    stage('SonarQube Analysis') {
      steps {
        sonarAnalysis(projectKey: env.SONAR_PROJECT)
      }
    }

    stage('Container Build & Push') {
      when { not { changeRequest() } }
      steps {
        buildAndPushImage(
          imageName: env.IMAGE_NAME,
          dockerTag: env.DOCKER_TAG,
          context:   '.',
          target:    'production',
        )
      }
    }

    stage('Integration Test') {
      when {
        anyOf {
          branch 'develop'
          branch pattern: 'release/.*', comparator: 'REGEXP'
        }
      }
      steps {
        sh 'docker compose -f docker-compose.test.yml up -d database product-service --wait'
        sh 'sleep 5'

        dir('src') {
          sh '''
            DB_HOST=localhost \
            DB_PORT=15433 \
            DB_NAME=ecommerce \
            DB_USER=postgres \
            DB_PASSWORD=password \
            PRODUCT_SERVICE_HOST=localhost \
            PRODUCT_SERVICE_PORT=13001 \
            npm run test:integration
          '''
        }
      }
      post {
        always {
          sh 'docker compose -f docker-compose.test.yml down -v || true'
          junit testResults: 'src/coverage/junit.xml', allowEmptyResults: true
        }
      }
    }

    stage('Deploy - Dev') {
      when { branch 'develop' }
      steps {
        deployToK8s(
          namespace:   'dev',
          serviceName: env.SERVICE_NAME,
          imageName:   env.IMAGE_NAME,
          dockerTag:   env.DOCKER_TAG,
        )
      }
    }

    stage('Deploy - Staging') {
      when { branch pattern: 'release/.*', comparator: 'REGEXP' }
      steps {
        deployToK8s(
          namespace:   'staging',
          serviceName: env.SERVICE_NAME,
          imageName:   env.IMAGE_NAME,
          dockerTag:   env.DOCKER_TAG,
        )
      }
    }

    stage('Approval - Prod') {
      when { branch 'main' }
      steps {
        timeout(time: 30, unit: 'MINUTES') {
          input(
            message:   "Deploy ${env.SERVICE_NAME}:${env.DOCKER_TAG} to PRODUCTION?",
            ok:        'Deploy',
            submitter: 'admin',
          )
        }
      }
    }

    stage('Deploy - Prod') {
      when { branch 'main' }
      steps {
        deployToK8s(
          namespace:   'prod',
          serviceName: env.SERVICE_NAME,
          imageName:   env.IMAGE_NAME,
          dockerTag:   env.DOCKER_TAG,
        )
      }
    }

    stage('Archive Artifacts') {
      steps {
        archiveArtifacts artifacts: 'artifacts/**', fingerprint: true, allowEmptyArchive: true
      }
    }

  }

  post {
    always { cleanWs() }
  }
}