const fs = require('fs')

// Function to replace import paths in the specified file
function replaceImportPaths (filePathToUpdate) {
    try {
        // Read the file content
        let fileContent = fs.readFileSync(filePathToUpdate, 'utf8').split('\n')

        // Replace the specified import paths
        fileContent = fileContent.map(line =>
            line.replace(/ from '\.\.\/\.\.\/components\//g, " from './")
        )

        // Write updated content back to the file
        fs.writeFileSync(filePathToUpdate, fileContent.join('\n'), 'utf8')

        // eslint-disable-next-line no-console
        console.log(`Import paths have been successfully updated in ${filePathToUpdate}`)
    } catch (error) {
        console.error('Error:', error.message)
    }
}

// Example usage with arguments passed as command-line arguments
const args = process.argv.slice(2)

if (args.length !== 1) {
    console.error('Usage: node replaceImportPaths.js <path-to-file-to-update>')
    process.exit(1)
}

const [filePathToUpdate] = args
replaceImportPaths(filePathToUpdate)
