# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk AS build

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/*

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw \
    && ./mvnw -B -ntp dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -ntp clean package -DskipTests

FROM eclipse-temurin:25-jre

WORKDIR /app

RUN groupadd --system spring \
    && useradd --system --gid spring --home-dir /app spring

COPY --from=build /workspace/target/*.jar app.jar

USER spring

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
