pipeline {
    agent {
        kubernetes {
            cloud 'kubernetes'
            inheritFrom 'buildkit-agent'
        }
    }

    environment {
        APP_NAME = "funch-backend"
        NAMESPACE = "funch-backend"
        IMAGE_NAME = "ghcr.io/louiskub/funch-backend"
        CREDENTIAL_ID = "github-pat"
        APP_ENV_CREDENTIAL_ID = "funch-backend-env"
        POSTGRES_ENV_CREDENTIAL_ID = "funch-postgres-env"
        MINIO_ROOT_CREDENTIAL_ID = "funch-minio-root-env"
        MINIO_APP_CREDENTIAL_ID = "funch-minio-app-env"
    }

    parameters {
        booleanParam(name: 'RUN_DEMO_SEED', defaultValue: false, description: 'Reset the fixed demo users, sessions, bookings, options and gallery images')
    }

    options {
        disableConcurrentBuilds()
    }

    stages {
        stage('Test') {
            steps {
                container("node") {
                    sh "npm ci"
                    sh "npm run lint"
                    sh "npm run test"
                }
            }
        }

        stage("Build Image") {
            steps {
                container('buildctl') {
                    withCredentials([
                        usernamePassword(credentialsId: "${CREDENTIAL_ID}",
                        usernameVariable: 'REG_USER',
                        passwordVariable: 'REG_PASS')
                    ]) {
                        sh "echo ${APP_NAME}"
                        sh """
                        mkdir -p ~/.docker
                        AUTH=\$(echo -n "\${REG_USER}:\${REG_PASS}" | base64 | tr -d '\\n')
                        echo "{\\"auths\\":{\\"ghcr.io\\":{\\"auth\\":\\"\$AUTH\\"}}}" > ~/.docker/config.json
                        """
                        sh """
                        buildctl build --frontend dockerfile.v0 \
                        --local context=. \
                        --local dockerfile=. \
                        --output type=image,\\"name=${IMAGE_NAME},${IMAGE_NAME}:1.0.${BUILD_NUMBER}\\",push=true
                        """
                    }
                }
            }
        }

        stage("Prepare Database") {
            steps {
                container('kubectl') {
                    withCredentials([
                        usernamePassword(credentialsId: "${CREDENTIAL_ID}",
                        usernameVariable: 'REG_USER',
                        passwordVariable: 'REG_PASS'),
                        file(credentialsId: "${APP_ENV_CREDENTIAL_ID}",
                        variable: 'APP_ENV_FILE'),
                        file(credentialsId: "${POSTGRES_ENV_CREDENTIAL_ID}",
                        variable: 'POSTGRES_ENV_FILE'),
                        file(credentialsId: "${MINIO_ROOT_CREDENTIAL_ID}",
                        variable: 'MINIO_ROOT_ENV_FILE'),
                        file(credentialsId: "${MINIO_APP_CREDENTIAL_ID}",
                        variable: 'MINIO_APP_ENV_FILE')
                    ]) {
                        script {
                            try {
                                sh "kubectl create ns ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -"
                                sh """
                                kubectl create secret docker-registry regcred \
                                    --namespace=${NAMESPACE} \
                                    --docker-server=ghcr.io \
                                    --docker-username=\${REG_USER} \
                                    --docker-password=\${REG_PASS} \
                                    --dry-run=client -o yaml | kubectl apply -f -
                                """
                                sh """
                                kubectl create secret generic funch-backend-env \
                                    --namespace=${NAMESPACE} \
                                    --from-env-file="\$APP_ENV_FILE" \
                                    --dry-run=client -o yaml | kubectl apply -f -
                                """
                                sh 'kubectl create secret generic funch-postgres-env --namespace="$NAMESPACE" --from-env-file="$POSTGRES_ENV_FILE" --dry-run=client -o yaml | kubectl apply -f -'
                                sh 'kubectl create secret generic funch-minio-root-env --namespace="$NAMESPACE" --from-env-file="$MINIO_ROOT_ENV_FILE" --dry-run=client -o yaml | kubectl apply -f -'
                                sh 'kubectl create secret generic funch-minio-app-env --namespace="$NAMESPACE" --from-env-file="$MINIO_APP_ENV_FILE" --dry-run=client -o yaml | kubectl apply -f -'
                                sh "kubectl apply -f k8s/postgres.yml"
                                sh "kubectl apply -f k8s/minio.yml"
                                sh "kubectl rollout status statefulset/postgres -n ${NAMESPACE} --timeout=5m"
                                sh "kubectl rollout status statefulset/minio -n ${NAMESPACE} --timeout=5m"
                                sh "kubectl wait --for=condition=complete job/funch-minio-init -n ${NAMESPACE} --timeout=5m"
                                sh "kubectl delete job funch-db-migrate -n ${NAMESPACE} --ignore-not-found=true"
                                sh "kubectl apply -f k8s/migration-job.yml"
                                sh "kubectl wait --for=condition=complete job/funch-db-migrate -n ${NAMESPACE} --timeout=5m"
                            } catch (e){
                                sh "echo error: ${e}"
                                error("${e}")
                            }
                        }
                    }
                }
            }
        }

        stage('Seed') {
            steps {
                withCredentials([
                    file(credentialsId: "${APP_ENV_CREDENTIAL_ID}",
                    variable: 'APP_ENV_FILE')
                ]) {
                    container('kubectl') {
                        sh 'nohup kubectl port-forward service/postgres 15432:5432 -n "$NAMESPACE" > "$WORKSPACE/.postgres-port-forward.log" 2>&1 < /dev/null & echo $! > "$WORKSPACE/.postgres-port-forward.pid"'
                        sh 'nohup kubectl port-forward service/minio 19000:9000 -n "$NAMESPACE" > "$WORKSPACE/.minio-port-forward.log" 2>&1 < /dev/null & echo $! > "$WORKSPACE/.minio-port-forward.pid"'
                    }
                    container('node') {
                        sh '''
                        set -eu
                        sed -e 's|@postgres:5432|@127.0.0.1:15432|' \\
                            -e 's|http://minio:9000|http://127.0.0.1:19000|' \\
                            "$APP_ENV_FILE" > "$WORKSPACE/.seed-env"
                        for port in 15432 19000; do
                            ready=false
                            i=0
                            while [ "$i" -lt 30 ]; do
                                if PORT="$port" node -e 'const net=require("node:net"); const s=net.connect(Number(process.env.PORT),"127.0.0.1"); s.once("connect",()=>{s.end();process.exit(0)}); s.once("error",()=>process.exit(1))'; then
                                    ready=true
                                    break
                                fi
                                i=$((i + 1))
                                sleep 1
                            done
                            [ "$ready" = true ] || { echo "Port forward $port did not become ready" >&2; exit 1; }
                        done
                        node --env-file="$WORKSPACE/.seed-env" -r ts-node/register scripts/seed.ts
                        if [ "$RUN_DEMO_SEED" = "true" ]; then
                            node --env-file="$WORKSPACE/.seed-env" -r ts-node/register scripts/seed-demo.ts
                        fi
                        '''
                    }
                }
            }
            post {
                always {
                    container('kubectl') {
                        sh '''
                        for pid_file in "$WORKSPACE/.postgres-port-forward.pid" "$WORKSPACE/.minio-port-forward.pid"; do
                            if [ -f "$pid_file" ]; then
                                kill "$(cat "$pid_file")" 2>/dev/null || true
                                rm -f "$pid_file"
                            fi
                        done
                        rm -f "$WORKSPACE/.postgres-port-forward.log" "$WORKSPACE/.minio-port-forward.log"
                        '''
                    }
                    container('node') {
                        sh 'rm -f "$WORKSPACE/.seed-env"'
                    }
                }
            }
        }

        stage('Deploy Backend') {
            steps {
                container('kubectl') {
                    sh "kubectl apply -f k8s/backend.yml"
                    sh "kubectl set image deployment/${APP_NAME} -n ${NAMESPACE} ${APP_NAME}=${IMAGE_NAME}:1.0.${BUILD_NUMBER}"
                    sh "kubectl rollout status deployment/${APP_NAME} -n ${NAMESPACE} --timeout=5m"
                }
            }
        }
    }
}
