/* eslint-disable no-undef */
describe('UIScheduler Component', () => {
    beforeEach(() => {
        cy.deployFixture('dashboard-scheduler')
        cy.visit('/dashboard/page1')
    })

    it('should render the UIScheduler component', () => {
        cy.get('.main').should('exist')
        cy.get('.v-toolbar-title__placeholder').contains('Scheduler')
    })

    it('can add new schedule and verify it is added to the table', () => {
        // Wait until the button is visible and interactable
        cy.get('#nrdb2-ui-scheduler-new-schedule-button')
            .should('be.visible')
            .and('not.be.disabled')
        cy.wait(100)

        // Click the button to open the new schedule dialog
        cy.get('#nrdb2-ui-scheduler-new-schedule-button').click()
        // Wait for the dialog to appear and verify its content
        cy.get('.v-dialog').should('be.visible')
        cy.get('.v-card-title').contains('New Schedule')

        // Fill in the schedule details
        cy.get('#nrdb2-ui-scheduler-schedule-name-input').type('{selectall}{del}Test Schedule')

        // Save the new schedule
        cy.get('button').contains('Save').click()

        // Verify the new schedule is added to the table
        cy.get('.v-data-table tbody').within(() => {
            cy.contains('tr', 'Test Schedule').should('exist')
        })
    })

    it('should toggle schedule enabled state', () => {
        cy.wait(100)
        // Add new schedule
        cy.get('button').contains('Add Schedule').click()

        cy.get('.v-data-table tbody tr').first().within(() => {
            cy.get('#nrdb2-ui-scheduler-schedule-enable-switch').click()
            cy.get('#nrdb2-ui-scheduler-schedule-enable-switch').should('not.have.class', 'v-input--is-checked')
        })
    })

    it('should edit an existing schedule', () => {
        cy.wait(100)
        // Add new schedule
        cy.get('button').contains('Add Schedule').click()
        cy.wait(100)

        cy.get('.v-data-table tbody tr').first().click()
        cy.get('#nrdb2-ui-scheduler-edit-schedule-button').click()
        cy.get('.v-dialog').should('be.visible')
        cy.get('.v-card-title').contains('Edit Schedule')
    })

    it('should delete a schedule', () => {
        cy.wait(100)
        // Add new schedule
        cy.get('button').contains('Add Schedule').click()
        cy.wait(100)

        cy.get('.v-data-table tbody tr').first().click()
        cy.get('#nrdb2-ui-scheduler-edit-schedule-button').click()
        cy.get('.v-dialog').should('be.visible')
        cy.get('#nrdb2-ui-scheduler-delete-schedule-button').click()
        cy.get('.v-dialog').contains('Are you sure you want to delete this schedule?').should('be.visible')
        cy.get('button').contains('Delete').click()
        cy.get('.v-data-table tbody tr').contains('No Schedules')
    })

    it('should export a schedule', () => {
        cy.wait(100)
        // Add new schedule
        cy.get('button').contains('Add Schedule').click()
        cy.wait(100)

        cy.get('.v-data-table tbody tr').first().click()
        cy.get('#nrdb2-ui-scheduler-edit-schedule-button').click()
        cy.get('.v-dialog').should('be.visible')
        cy.get('#nrdb2-ui-scheduler-export-schedule-button').click()
        cy.get('.v-dialog').contains('Export Schedule').should('be.visible')
        cy.clickAndWait(cy.get('button').contains('Copy'))
        cy.get('.v-alert__content').contains('Copied to clipboard')
    })

    it('should import a schedule', () => {
    // Wait until the button is visible and interactable
        cy.get('#nrdb2-ui-scheduler-new-schedule-button')
            .should('be.visible')
            .and('not.be.disabled')
        cy.wait(100)

        // Click the button to open the new schedule dialog
        cy.get('#nrdb2-ui-scheduler-new-schedule-button').click()
        // Wait for the dialog to appear and verify its content
        cy.get('.v-dialog').should('be.visible')
        cy.get('.v-card-title').contains('New Schedule')
        cy.get('#nrdb2-ui-scheduler-import-schedule-button').click()
        cy.get('.v-dialog').contains('Import Schedule').should('be.visible')
        const scheduleJSON = '{"name": "Test Schedule", "topic": "Topic 1", "enabled": true, "scheduleType": "time", "period": "daily", "time": "00:00", "timespan": false, "days": ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], "payloadType": true, "payloadValue": true, "isDynamic": true}'

        cy.get('#nrdb2-ui-scheduler-import-schedule-textarea').invoke('val', scheduleJSON).trigger('input')
        cy.get('button').contains('Import').click()
        // Save the new schedule
        cy.get('button').contains('Save').click()

        // Verify the new schedule is added to the table
        cy.get('.v-data-table tbody').within(() => {
            cy.contains('tr', 'Test Schedule').should('exist')
        })
    })
})
