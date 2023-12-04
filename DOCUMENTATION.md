# BACK-END DOCUMENTATION

## Overview

This document is dedicated to the deployment of the INTUITION app's backend. It specifically covers the setup and running of the Express-based server component. For usage and interaction with the app's frontend, please refer to the Front-End Documentation.

## Deploying the Application

### Prerequisites

- Node.js and npm (Node Package Manager) installed.
- Access to the code repository of the INTUITION backend service.

### Steps

1. Clone the backend repository to your local machine.
2. Navigate to the backend application directory.
3. Run `npm install` to install all necessary dependencies.
4. To start the backend service, use `npm start`. By default, the service will run on `http://localhost:8080`.
5. To configure a different port for the backend service, modify the `PORT` variable in the `.env` file located in the project root.
6. Ensure that the frontend application is configured to communicate with the backend service. If the backend service is running on a different URL or port, update the `backendUrl` parameter in the frontend's `public/config.js` file.

*Note: Deployment steps and configurations may vary based on the specific environment or hosting service being used.*

## Logging and Monitoring

- The backend application employs a comprehensive logging system using the `winston` library, enhanced with `winston-daily-rotate-file` for log rotation.
- Logs are categorized into different levels such as `info`, `error`, and `debug`, and are output in different formats depending on the environment:
  - In development, logs are output to the console in a simple, colorized text format for easy readability.
  - In production, logs are structured in JSON format. They are written to files in the `logs` directory, with separate files for errors (`error-%DATE%.log`) and combined logs (`application-%DATE%.log`).
- Log rotation is configured to create new log files daily, and each log file is limited to 20MB in size. Files older than 14 days are automatically deleted to manage disk space.
- The logging system captures crucial information, including server start-up events, errors during SPARQL query executions, and performance metrics like the time taken for query execution.

## Security Considerations

- Ensure to follow best practices for securing Express applications, including setting appropriate headers, managing CORS policies, and handling authentication and authorization.

## Contact and Support

For further assistance, bug reporting, or contributions to the backend of the INTUITION app, feel free to create an issue in the repository or contact the development team directly.
