'use strict'

$(window).load(function() {
    setTimeout(function() {
        $('#loading').fadeOut(500);
    }, 250);
    setTimeout(function() {
        $('#loading').remove();
    }, 500);
})
$(window).load(function() {

    $.getJSON('accordions.json', function (data) {
            for(const [i, accordion] of data.accordions.entries()) {
                console.log(i, accordion)

                    const html = `<div class="panel panel-default">
                        <div class="panel-heading" role="tab" id="${accordion.key}">
                            <h4 class="panel-title">
                                <a role="button" 
                                data-toggle="collapse" 
                                data-parent="#accordion"
                                href="#${accordion.key}-description"
                                aria-expanded="true" 
                                aria-controls="${accordion.key}-description"
                                class="${i === 0 ? '' : 'collapsed'}"
                                >
                                    ${accordion.title}
                                </a>
                            </h4>
                        </div>
                        <div id="${accordion.key}-description" class="panel-collapse collapse in ${i === 0 ? 'show' : ''}" role="tabpanel"
                             aria-labelledby="${accordion.key}">
                            <div class="panel-body">
                                ${marked.parse(accordion.description)}
                            </div>
                        </div>
                    </div>`
                    $('#accordion').append(html)

            }
        }
    )
    $('#contact').on('submit', contactSubmit)


})
async function contactSubmit(form) {
    $('#contact-form-submit').attr('disabled', true).addClass('notransition');
    form.preventDefault();

    const email = $('#email').val()
    const slackInvite = $('#slack-invite').is(':checked')
    const emailUpdates = $('#update-emails').is(':checked')

    try {
        const formData = new FormData(form.target)
        const res = await $.ajax({
            type: "POST",
            url: '/',
            data: new URLSearchParams(formData).toString()
        })
        // const res = await $.ajax({
        //     type: 'POST',
        //     url: 'https://api.friggframework.org/subscribe',
        //     data: JSON.stringify({email, slackInvite, emailUpdates}),
        //     contentType: 'application/json;charset=utf-8',
        //     dataType: 'json',
        // })
        console.log(res)
        window.alert('Thanks, we\'ll see you soon!')
        $('#contact-form-submit').attr('disabled', false).removeClass('notransition');
        $('#email').val('');
        $('#email').focus();

    } catch (e) {
        console.error(e)
        $('#contact-form-submit').attr('disabled', false).removeClass('notransition');
        $('#email').val('');
        $('#email').focus();
        return
    }
}

