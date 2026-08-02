-- Each microservice owns its own database (database-per-service pattern).
-- Prisma migrations fill in the tables inside each one at service startup.
CREATE DATABASE authdb;
CREATE DATABASE catalogdb;
CREATE DATABASE playbackdb;
CREATE DATABASE billingdb;
