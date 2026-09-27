import AuthenticationServices
import Capacitor

// Sign in with Apple, natively: Apple's own sheet (Face ID) returns a signed identity token, the web app hands it to
// the server (src/lib/aiAccess.ts), which checks it with Apple. A local plugin, because the community one only
// ships for CocoaPods and this project uses Swift Package Manager.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)]
    private var pending: CAPPluginCall?
    private var controller: ASAuthorizationController? // held until Apple answers, so its callback surely comes

    @objc func authorize(_ call: CAPPluginCall) {
        // one sheet at a time: a second tap while it opens would otherwise orphan the first call
        guard pending == nil else { return call.reject("already signing in", "BUSY") }
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = call.getString("nonce")
        pending = call
        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken, let token = String(data: data, encoding: .utf8) else {
            pending?.reject("no identity token")
            pending = nil
            self.controller = nil
            return
        }
        var result: [String: Any] = ["identityToken": token]
        // a one-time code; deleting the account hands it to the server, which revokes Apple's tokens with it
        if let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) { result["authorizationCode"] = code }
        if let given = credential.fullName?.givenName { result["givenName"] = given }
        if let family = credential.fullName?.familyName { result["familyName"] = family }
        pending?.resolve(result)
        pending = nil
        self.controller = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        pending?.reject(cancelled ? "cancelled" : error.localizedDescription, cancelled ? "CANCELLED" : nil)
        pending = nil
        self.controller = nil
    }
}

/// Capacitor's view controller plus the app's own plugins (npm plugins register themselves)
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(CoffeePlugin())
    }
}
