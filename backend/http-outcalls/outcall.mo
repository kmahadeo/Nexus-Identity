import Blob "mo:base/Blob";
import Cycles "mo:base/ExperimentalCycles";
import Text "mo:base/Text";
import Nat64 "mo:base/Nat64";

module {
  public type HttpHeader = { name : Text; value : Text };

  public type HttpMethod = { #get; #post; #head };

  public type HttpRequestArgs = {
    url : Text;
    max_response_bytes : ?Nat64;
    headers : [HttpHeader];
    body : ?Blob;
    method : HttpMethod;
    transform : ?TransformRawResponseFunction;
  };

  public type HttpResponsePayload = {
    status : Nat;
    headers : [HttpHeader];
    body : Blob;
  };

  public type TransformRawResponseFunction = {
    function : shared query TransformationInput -> async TransformationOutput;
    context : Blob;
  };

  public type TransformationInput = {
    response : HttpResponsePayload;
    context : Blob;
  };

  public type TransformationOutput = HttpResponsePayload;

  public type IC = actor {
    http_request : HttpRequestArgs -> async HttpResponsePayload;
  };

  public func transform(input : TransformationInput) : TransformationOutput {
    {
      status = input.response.status;
      body = input.response.body;
      headers = [];
    };
  };

  public func httpGetRequest(
    url : Text,
    headers : [HttpHeader],
    transformFn : shared query TransformationInput -> async TransformationOutput,
  ) : async Text {
    let ic : IC = actor ("aaaaa-aa");
    Cycles.add<system>(230_949_972_000);

    let response = await ic.http_request({
      url = url;
      max_response_bytes = ?Nat64.fromNat(10_000);
      headers = headers;
      body = null;
      method = #get;
      transform = ?{
        function = transformFn;
        context = Blob.fromArray([]);
      };
    });

    switch (Text.decodeUtf8(response.body)) {
      case (?text) { text };
      case null { "" };
    };
  };

  public func httpPostRequest(
    url : Text,
    headers : [HttpHeader],
    payload : Text,
    transformFn : shared query TransformationInput -> async TransformationOutput,
  ) : async Text {
    let ic : IC = actor ("aaaaa-aa");
    Cycles.add<system>(230_949_972_000);

    let requestHeaders = [
      { name = "Content-Type"; value = "application/json" },
      { name = "User-Agent"; value = "nexus-identity-canister" },
    ];

    let response = await ic.http_request({
      url = url;
      max_response_bytes = ?Nat64.fromNat(10_000);
      headers = requestHeaders;
      body = ?Text.encodeUtf8(payload);
      method = #post;
      transform = ?{
        function = transformFn;
        context = Blob.fromArray([]);
      };
    });

    switch (Text.decodeUtf8(response.body)) {
      case (?text) { text };
      case null { "" };
    };
  };
};
