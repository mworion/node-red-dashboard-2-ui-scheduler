const fs = require('fs')

// Function to update or add versioning and package info
function writePackageInfoToFile (packageJsonPath, filePathToUpdate) {
    try {
        // Read the specified package.json file
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        const version = packageJson.version
        const packageName = packageJson.name

        if (!version || !packageName) {
            throw new Error('Version or package name not found in package.json')
        }

        // Read the file to update
        let fileContent = fs.readFileSync(filePathToUpdate, 'utf8').split('\n')

        // Remove any existing version and packageName declarations
        fileContent = fileContent.filter(
            line => !line.startsWith('const version =') && !line.startsWith('const packageName =')
        )

        // Prepend version and package info
        fileContent.unshift(
            `const version = '${version}'`,
            `const packageName = '${packageName}'`
        )

        // Write updated content back to the file
        fs.writeFileSync(filePathToUpdate, fileContent.join('\n'), 'utf8')

        // eslint-disable-next-line no-console
        console.log(`Version ${version} and package name ${packageName} have been added/updated in ${filePathToUpdate}`)
    } catch (error) {
        console.error('Error:', error.message)
    }
}

// Example usage with arguments passed as command-line arguments
const args = process.argv.slice(2)

if (args.length !== 2) {
    console.error('Usage: node addPackageInfo.js <path-to-package.json> <path-to-file-to-update>')
    process.exit(1)
}

const [packageJsonPath, filePathToUpdate] = args
writePackageInfoToFile(packageJsonPath, filePathToUpdate)
